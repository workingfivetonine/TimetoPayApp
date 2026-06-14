import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  catalogItemsTable,
  catalogStoresTable,
  adminNotificationStateTable,
} from "@workspace/db";
import { logger } from "./logger";
import { sendGmail } from "./email/gmailClient";

// Up to this many example names per section in the digest body.
const SAMPLE_LIMIT = 10;
const STATE_ID = "singleton";

export interface DigestSection {
  count: number;
  samples: string[];
}

export interface AdminDigest {
  since: Date | null;
  until: Date;
  items: DigestSection;
  stores: DigestSection;
  users: DigestSection;
  total: number;
}

export interface RunDigestResult {
  sent: boolean;
  reason?:
    | "nothing-new"
    | "no-admin-email"
    | "min-gap"
    | "send-failed"
    | "concurrent";
  recipient?: string;
  digest: AdminDigest;
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Ensure the singleton state row exists (no-op once created).
async function ensureStateRow(): Promise<void> {
  await db
    .insert(adminNotificationStateTable)
    .values({ id: STATE_ID })
    .onConflictDoNothing();
}

async function getState() {
  const [row] = await db
    .select()
    .from(adminNotificationStateTable)
    .where(eq(adminNotificationStateTable.id, STATE_ID));
  return row ?? null;
}

// Resolve the single master admin's email (the digest recipient). Returns null
// when there is no admin or the admin row has no email.
export async function resolveAdminRecipient(): Promise<string | null> {
  const [admin] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true));
  return admin?.email ?? null;
}

// Compute the digest of new catalog items / stores / users in the half-open
// window (since, until]. `since` null ⇒ first run (report everything).
export async function computeAdminDigest(
  since: Date | null,
  until: Date,
): Promise<AdminDigest> {
  const sinceTs = since ?? new Date(0);

  const itemWindow = and(
    gt(catalogItemsTable.createdAt, sinceTs),
    lte(catalogItemsTable.createdAt, until),
  );
  const [{ count: itemCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogItemsTable)
    .where(itemWindow);
  const itemRows = await db
    .select({ name: catalogItemsTable.canonicalName })
    .from(catalogItemsTable)
    .where(itemWindow)
    .orderBy(desc(catalogItemsTable.createdAt))
    .limit(SAMPLE_LIMIT);
  const items: DigestSection = {
    count: itemCount,
    samples: itemRows.map((r) => r.name),
  };

  const storeWindow = and(
    gt(catalogStoresTable.createdAt, sinceTs),
    lte(catalogStoresTable.createdAt, until),
  );
  const [{ count: storeCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogStoresTable)
    .where(storeWindow);
  const storeRows = await db
    .select({ name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable)
    .where(storeWindow)
    .orderBy(desc(catalogStoresTable.createdAt))
    .limit(SAMPLE_LIMIT);
  const stores: DigestSection = {
    count: storeCount,
    samples: storeRows.map((r) => r.name),
  };

  const userWindow = and(
    gt(usersTable.createdAt, sinceTs),
    lte(usersTable.createdAt, until),
  );
  const [{ count: userCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(userWindow);
  const userRows = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(userWindow)
    .orderBy(desc(usersTable.createdAt))
    .limit(SAMPLE_LIMIT);
  const users: DigestSection = {
    count: userCount,
    samples: userRows.map((u) => u.email ?? u.id),
  };

  return {
    since,
    until,
    items,
    stores,
    users,
    total: items.count + stores.count + users.count,
  };
}

function fmtSection(label: string, s: DigestSection): { text: string; html: string } {
  const head = `${s.count} new ${label}`;
  if (s.count === 0) {
    return { text: `• ${head}`, html: `<li><strong>${head}</strong></li>` };
  }
  const shown = s.samples.join(", ");
  const more = s.count > s.samples.length ? `, and ${s.count - s.samples.length} more` : "";
  return {
    text: `• ${head}: ${shown}${more}`,
    html: `<li><strong>${head}</strong>: ${escapeHtml(shown)}${escapeHtml(more)}</li>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function composeEmail(digest: AdminDigest): { subject: string; text: string; html: string } {
  const subject =
    digest.total > 0
      ? `TimetoPay — ${digest.total} new item(s) to review`
      : `TimetoPay — nothing new to review`;
  const sinceLine = digest.since
    ? `Since ${digest.since.toISOString()}`
    : `All time (first digest)`;

  const sections = [
    fmtSection("catalog item(s)", digest.items),
    fmtSection("catalog store(s)", digest.stores),
    fmtSection("user(s)", digest.users),
  ];

  const text = [
    "TimetoPay — admin review digest",
    sinceLine,
    "",
    ...sections.map((s) => s.text),
    "",
    "Review them in the admin area (Manage catalog / Users).",
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,Arial,sans-serif;color:#1f2937">`,
    `<h2 style="margin:0 0 4px">TimetoPay — admin review digest</h2>`,
    `<p style="color:#6b7280;margin:0 0 12px">${escapeHtml(sinceLine)}</p>`,
    `<ul style="line-height:1.6">`,
    ...sections.map((s) => s.html),
    `</ul>`,
    `<p style="color:#6b7280">Review them in the admin area (Manage catalog / Users).</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}

// Run the admin review digest.
//   trigger "scheduled" — enforces a min-gap, skips when nothing is new, and on
//     a successful send advances the cursor (consumes the queue).
//   trigger "manual" — a test/preview: always sends (even when empty, as a
//     wiring confirmation), ignores the min-gap, and does NOT advance the cursor.
export async function runAdminDigest(opts: {
  trigger: "scheduled" | "manual";
}): Promise<RunDigestResult> {
  await ensureStateRow();
  // Use DB time (not app time) for the window's upper bound so it is always
  // consistent with rows' DB-stamped createdAt — app clock skew can't open a gap.
  // `now()` comes back as a string from the raw sql expression, so coerce to a
  // Date for Drizzle's timestamp param mapping.
  const [{ until: untilRaw }] = await db
    .select({ until: sql<string>`now()` })
    .from(adminNotificationStateTable)
    .where(eq(adminNotificationStateTable.id, STATE_ID));
  const until = new Date(untilRaw);
  const state = await getState();
  const since = state?.lastDigestSentAt ?? null;

  const digest = await computeAdminDigest(since, until);

  if (opts.trigger === "scheduled") {
    const minGapMs = envInt("ADMIN_DIGEST_MIN_GAP_MS", 12 * 60 * 60 * 1000);
    if (since && until.getTime() - since.getTime() < minGapMs) {
      return { sent: false, reason: "min-gap", digest };
    }
    if (digest.total === 0) {
      return { sent: false, reason: "nothing-new", digest };
    }
  }

  const recipient = await resolveAdminRecipient();
  if (!recipient) {
    logger.warn("Admin digest skipped: no admin email on file");
    return { sent: false, reason: "no-admin-email", digest };
  }

  // For a scheduled send, atomically CLAIM the window before sending by advancing
  // the cursor only if it still equals the value we read. This guarantees exactly
  // one runner owns (since, until], so overlapping ticks can't double-send. The
  // claim is rolled back if the send fails so the window isn't silently lost. A
  // manual test never claims (it does not consume the queue).
  if (opts.trigger === "scheduled") {
    const claimed = await db
      .update(adminNotificationStateTable)
      .set({ lastDigestSentAt: until })
      .where(
        and(
          eq(adminNotificationStateTable.id, STATE_ID),
          since === null
            ? isNull(adminNotificationStateTable.lastDigestSentAt)
            : eq(adminNotificationStateTable.lastDigestSentAt, since),
        ),
      )
      .returning({ id: adminNotificationStateTable.id });
    if (claimed.length === 0) {
      return { sent: false, reason: "concurrent", digest };
    }
  }

  const { subject, text, html } = composeEmail(digest);
  try {
    await sendGmail({ to: recipient, subject, text, html });
  } catch (err) {
    logger.error({ err }, "Admin digest email send failed");
    // Roll the claimed cursor back so the unsent window is reported next time.
    if (opts.trigger === "scheduled") {
      await db
        .update(adminNotificationStateTable)
        .set({ lastDigestSentAt: since })
        .where(
          and(
            eq(adminNotificationStateTable.id, STATE_ID),
            eq(adminNotificationStateTable.lastDigestSentAt, until),
          ),
        );
    }
    return { sent: false, reason: "send-failed", recipient, digest };
  }

  logger.info(
    { trigger: opts.trigger, total: digest.total, recipient },
    "Admin digest sent",
  );
  return { sent: true, recipient, digest };
}
