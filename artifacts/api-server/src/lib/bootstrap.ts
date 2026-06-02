import { and, eq, lt, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  usersTable,
  storesTable,
  itemsTable,
  receiptsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { getBootstrapAdminEmails, normalizeEmail } from "./adminBootstrap";

// One-time, idempotent data reconciliations run at server startup. Safe to run
// on every boot: each step self-disables once it has nothing left to do, so it
// works automatically in both dev and production.

// Earlier versions of the app auto-claimed all pre-existing ownerless rows for
// the first elected admin. We no longer do that. This releases any rows that
// were claimed that way (rows the admin owns whose createdAt predates the
// admin's own account — provably not scanned by the admin, since you can't scan
// before signing up) back to ownerless (userId = NULL). The data stays in the
// anonymized global price catalog (which ignores userId) but disappears from
// the admin's personal Receipts / List / Analytics. Naturally idempotent: once
// released the rows no longer match (userId is NULL), and nothing re-claims them.
async function releaseLegacyAdminData(): Promise<void> {
  const [admin] = await db
    .select({ id: usersTable.id, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true));
  if (!admin) return;

  const releasedStores = await db
    .update(storesTable)
    .set({ userId: null })
    .where(and(eq(storesTable.userId, admin.id), lt(storesTable.createdAt, admin.createdAt)))
    .returning({ id: storesTable.id });
  const releasedItems = await db
    .update(itemsTable)
    .set({ userId: null })
    .where(and(eq(itemsTable.userId, admin.id), lt(itemsTable.createdAt, admin.createdAt)))
    .returning({ id: itemsTable.id });
  const releasedReceipts = await db
    .update(receiptsTable)
    .set({ userId: null })
    .where(and(eq(receiptsTable.userId, admin.id), lt(receiptsTable.createdAt, admin.createdAt)))
    .returning({ id: receiptsTable.id });

  const total = releasedStores.length + releasedItems.length + releasedReceipts.length;
  if (total > 0) {
    logger.info(
      {
        stores: releasedStores.length,
        items: releasedItems.length,
        receipts: releasedReceipts.length,
      },
      "Released legacy admin-claimed data back to ownerless",
    );
  }
}

// Region scoping was added after stores already existed. Stores predating the
// feature have a NULL countryCode. Per the product decision, assume those legacy
// stores are US (the original user base), so they remain visible in the
// region-scoped catalog instead of silently disappearing. Idempotent: once
// backfilled the rows no longer match (countryCode is non-null).
async function backfillStoreRegions(): Promise<void> {
  const updated = await db
    .update(storesTable)
    .set({ countryCode: "US" })
    .where(sql`${storesTable.countryCode} is null`)
    .returning({ id: storesTable.id });
  if (updated.length > 0) {
    logger.info({ count: updated.length }, "Backfilled legacy stores to countryCode=US");
  }
}

// The one-time "Choose your plan" onboarding step (web) is shown to signed-in
// users whose `planSelectedAt` is NULL. It was added after users already
// existed, so every pre-existing user would otherwise be force-routed through it
// — violating the rule that RETURNING users skip onboarding. We treat any user
// who has already completed the earlier region-setup step (countryCode set) as a
// returning user and mark their plan choice as made, so only genuinely new
// accounts (which pick a region then a plan in one flow) ever see the screen.
// Idempotent: once stamped the rows no longer match (planSelectedAt non-null).
async function backfillPlanSelected(): Promise<void> {
  const updated = await db
    .update(usersTable)
    .set({ planSelectedAt: sql`now()` })
    .where(
      and(
        sql`${usersTable.countryCode} is not null`,
        sql`${usersTable.planSelectedAt} is null`,
      ),
    )
    .returning({ id: usersTable.id });
  if (updated.length > 0) {
    logger.info(
      { count: updated.length },
      "Backfilled planSelectedAt for returning users (skip choose-plan onboarding)",
    );
  }
}

// Keep the `role` label in sync with the `isAdmin` power flag for the elected
// admin. Backfills role='master_admin' for the existing admin after the role
// column is introduced. Idempotent (no-op once roles agree).
async function reconcileAdminRole(): Promise<void> {
  const updated = await db
    .update(usersTable)
    .set({ role: "master_admin" })
    .where(and(eq(usersTable.isAdmin, true), sql`${usersTable.role} <> 'master_admin'`))
    .returning({ id: usersTable.id });
  if (updated.length > 0) {
    logger.info({ count: updated.length }, "Reconciled admin role to master_admin");
  }
}

// Trusted recovery for the single-admin invariant. If no admin exists (which
// should never happen, but could after a bad migration, restore, or manual DB
// repair), recovery is anchored ONLY to the deployer-controlled
// ADMIN_BOOTSTRAP_EMAILS allowlist. We deliberately do NOT silently re-elect the
// earliest-created user — that would let an early public sign-up regain full
// admin after any admin-less state (a privilege-escalation path). With no
// allowlist configured, the app stays admin-less (a safe, explicit state) and
// the operator must set ADMIN_BOOTSTRAP_EMAILS to recover. Idempotent (no-op
// when an admin already exists, no allowlist is set, or no user matches it).
async function ensureAdminExists(): Promise<void> {
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true))
    .limit(1);
  if (admin) return;

  const adminEmails = getBootstrapAdminEmails();
  if (adminEmails.size === 0) {
    logger.warn(
      "No admin exists and ADMIN_BOOTSTRAP_EMAILS is unset — leaving the app " +
        "admin-less. Set ADMIN_BOOTSTRAP_EMAILS to a trusted email to recover admin access.",
    );
    return;
  }

  const candidates = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  // The local users.email is populated best-effort at account creation and may
  // be stale or historically unverified, so we NEVER make a privilege decision
  // on it alone. We use it only as a cheap pre-filter, then RE-VALIDATE each
  // candidate against Clerk and require a CURRENTLY-verified primary email that
  // is still in the allowlist — the same trust rule as the signup bootstrap.
  for (const candidate of candidates) {
    const localEmail = normalizeEmail(candidate.email);
    if (!localEmail || !adminEmails.has(localEmail)) continue;

    let verifiedAllowlisted = false;
    try {
      const clerkUser = await clerkClient.users.getUser(candidate.id);
      const primary =
        clerkUser.primaryEmailAddress ?? clerkUser.emailAddresses[0] ?? null;
      const primaryEmail = normalizeEmail(primary?.emailAddress);
      const primaryVerified = primary?.verification?.status === "verified";
      verifiedAllowlisted =
        primaryVerified && primaryEmail !== null && adminEmails.has(primaryEmail);
    } catch (err) {
      logger.warn(
        { err, userId: candidate.id },
        "Failed to verify bootstrap admin candidate against Clerk — skipping",
      );
    }
    if (!verifiedAllowlisted) continue;

    const promoted = await db
      .update(usersTable)
      .set({ isAdmin: true, role: "master_admin" })
      .where(
        and(
          eq(usersTable.id, candidate.id),
          sql`NOT EXISTS (SELECT 1 FROM users u WHERE u.is_admin = true)`,
        ),
      )
      .returning({ id: usersTable.id });
    if (promoted.length > 0) {
      logger.warn(
        { userId: candidate.id },
        "No admin existed — promoted trusted, Clerk-verified ADMIN_BOOTSTRAP_EMAILS user to master admin",
      );
      return;
    }
  }

  logger.warn(
    "No admin exists and no Clerk-verified user matches ADMIN_BOOTSTRAP_EMAILS — leaving the app admin-less.",
  );
}

export async function runStartupReconciliations(): Promise<void> {
  try {
    await reconcileAdminRole();
    await ensureAdminExists();
    await releaseLegacyAdminData();
    await backfillStoreRegions();
    await backfillPlanSelected();
  } catch (err) {
    logger.error({ err }, "Startup reconciliation failed");
  }
}
