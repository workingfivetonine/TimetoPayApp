import { and, eq, lt, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  storesTable,
  itemsTable,
  receiptsTable,
} from "@workspace/db";
import { logger } from "./logger";

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

// Safety net for the single-admin invariant: if there are users but none is an
// admin (which should never happen, but could after an unexpected failure), the
// app would be permanently admin-less since election only runs for brand-new
// signups. Promote the earliest-created user back to master admin so admin
// access can always be recovered on the next boot. Idempotent (no-op when an
// admin already exists or there are no users).
async function ensureAdminExists(): Promise<void> {
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true))
    .limit(1);
  if (admin) return;

  const [earliest] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .orderBy(usersTable.createdAt)
    .limit(1);
  if (!earliest) return;

  await db
    .update(usersTable)
    .set({ isAdmin: true, role: "master_admin" })
    .where(eq(usersTable.id, earliest.id));
  logger.warn({ userId: earliest.id }, "No admin found — elected earliest user as master admin");
}

export async function runStartupReconciliations(): Promise<void> {
  try {
    await reconcileAdminRole();
    await ensureAdminExists();
    await releaseLegacyAdminData();
  } catch (err) {
    logger.error({ err }, "Startup reconciliation failed");
  }
}
