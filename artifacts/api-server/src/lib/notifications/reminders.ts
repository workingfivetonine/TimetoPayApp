// Opt-in email reminder engine.
//
// Evaluates each reminder type per user and sends at most once per relevant
// period using the per-type "last sent" cursors on `usersTable`. Recipients are
// gated to subscription-related users only (entitled trialing/active/comped, or
// past_due) via `computeEntitlement`, and each type also honors the user's
// opt-out toggle. Every send goes through Resend with code-rendered HTML (see
// `lib/email/templates.ts`); when Resend isn't configured the send is a graceful
// no-op and the cursor is NOT advanced, so reminders resume once config lands.
import { and, eq, inArray, max, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  receiptsTable,
  itemsTable,
  lineItemsTable,
} from "@workspace/db";
import { computeEntitlement, TRIAL_DAYS } from "../billing/entitlement";
import { sendEmail, sendEmailWithTemplate } from "../email/resendClient";
import {
  renderTrialEnding,
  renderTrialEndingVars,
  renderPastDue,
  renderPastDueVars,
  renderListExport,
  renderListExportVars,
  renderReceiptInactivity,
  renderReceiptInactivityVars,
  renderWeeklySummary,
  renderWeeklySummaryVars,
  renderMonthlySummary,
  renderMonthlySummaryVars,
} from "../email/templates";
import {
  comparePeriods,
  monthStartOf,
  mondayOf,
  sumReceiptsInRange,
  type SpendReceipt,
} from "../analytics/spend";
import { buildReceiptSnark, displayNameFromEmail } from "./snark";
import { logger } from "../logger";

const DAY_MS = 24 * 60 * 60 * 1000;

// How close to trial end the "trial ending" reminder fires.
const TRIAL_ENDING_WINDOW_DAYS = 3;
// Re-nudge cadences (a reminder for an ongoing condition won't repeat faster).
const LIST_EXPORT_COOLDOWN_DAYS_WEEKLY = 7;
const LIST_EXPORT_COOLDOWN_DAYS_MONTHLY = 30;
const RECEIPT_INACTIVITY_THRESHOLD_DAYS = 7;
const RECEIPT_INACTIVITY_COOLDOWN_DAYS_WEEKLY = 7;
const RECEIPT_INACTIVITY_COOLDOWN_DAYS_MONTHLY = 30;
// A staple counts as "neglected" for the personalized jab after this long.
const NEGLECTED_STAPLE_DAYS = 21;
// Grace period after signup during which we send NO reminder emails of any type.
const SIGNUP_GRACE_DAYS = 2;

type UserRow = typeof usersTable.$inferSelect;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

export interface SweepResult {
  evaluatedUsers: number;
  sent: number;
  byType: Record<string, number>;
}

// Run one full reminder sweep across all subscription-related users. Safe to run
// repeatedly (idempotent per period); intended to be driven by the scheduler.
export async function runReminderSweep(
  now: Date = new Date(),
): Promise<SweepResult> {
  const result: SweepResult = { evaluatedUsers: 0, sent: 0, byType: {} };
  const bump = (type: string) => {
    result.sent += 1;
    result.byType[type] = (result.byType[type] ?? 0) + 1;
  };

  const allUsers = await db.select().from(usersTable);

  // Restrict to subscription-related users up front.
  const eligible = allUsers.filter((u) => {
    if (!u.email) return false;
    // Signup grace: never email anyone in their first couple of days.
    if (daysBetween(now, new Date(u.createdAt)) < SIGNUP_GRACE_DAYS) return false;
    const ent = computeEntitlement(u, now);
    const isPastDue = u.subscriptionStatus === "past_due";
    return ent.entitled || isPastDue;
  });
  result.evaluatedUsers = eligible.length;
  if (!eligible.length) return result;

  const eligibleIds = eligible.map((u) => u.id);

  // Batch-load the receipt rows we need for inactivity + spend summaries: only
  // the last ~70 days, which covers the prior week and prior month windows.
  const windowStart = new Date(now.getTime() - 70 * DAY_MS);
  const recentReceipts = await db
    .select({
      userId: receiptsTable.userId,
      total: receiptsTable.total,
      purchasedAt: receiptsTable.purchasedAt,
    })
    .from(receiptsTable)
    .where(
      and(
        inArray(receiptsTable.userId, eligibleIds),
        sql`${receiptsTable.purchasedAt} >= ${windowStart.toISOString()}`,
      ),
    );

  const receiptsByUser = new Map<string, SpendReceipt[]>();
  for (const r of recentReceipts) {
    if (!r.userId) continue;
    const arr = receiptsByUser.get(r.userId) ?? [];
    arr.push({ total: r.total, purchasedAt: r.purchasedAt });
    receiptsByUser.set(r.userId, arr);
  }

  // Batch-load the most recent receipt date per user (independent of the 70-day
  // window) for the inactivity check.
  const lastReceiptRows = await db
    .select({ userId: receiptsTable.userId, last: max(receiptsTable.purchasedAt) })
    .from(receiptsTable)
    .where(inArray(receiptsTable.userId, eligibleIds))
    .groupBy(receiptsTable.userId);
  const lastReceiptByUser = new Map<string, Date>();
  for (const row of lastReceiptRows) {
    if (row.userId && row.last) lastReceiptByUser.set(row.userId, new Date(row.last));
  }

  for (const user of eligible) {
    const ent = computeEntitlement(user, now);
    const updates: Partial<UserRow> = {};

    // ── Payment reminders ─────────────────────────────────────────────────
    if (user.notifyPaymentReminders) {
      await maybeTrialEnding(user, now, updates, bump);
      await maybePastDue(user, now, updates, bump);
    } else if (user.subscriptionStatus !== "past_due" && user.lastPastDueSentAt) {
      // Keep the past-due cursor reset semantics even if reminders are off.
      updates.lastPastDueSentAt = null;
    }

    // Engagement reminders only go to currently-entitled users (a past_due,
    // grace-elapsed user gets the payment reminder above, not nudges).
    if (ent.entitled) {
      if (user.notifyListExport) await maybeListExport(user, now, updates, bump);
      if (user.notifyReceiptReminders)
        await maybeReceiptInactivity(user, now, lastReceiptByUser.get(user.id) ?? null, updates, bump);
      if (user.notifySpendSummary)
        await maybeSpendSummaries(user, now, receiptsByUser.get(user.id) ?? [], updates, bump);
    }

    if (Object.keys(updates).length) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id));
    }
  }

  if (result.sent) logger.info({ result }, "Reminder sweep sent emails");
  return result;
}

// ── Trial ending ──────────────────────────────────────────────────────────
async function maybeTrialEnding(
  user: UserRow,
  now: Date,
  updates: Partial<UserRow>,
  bump: (t: string) => void,
): Promise<void> {
  if (!user.trialStartedAt) return;
  if (user.lastTrialEndingSentAt) return; // one trial per user, send once
  const trialEnd = new Date(user.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS);
  const windowOpen = new Date(trialEnd.getTime() - TRIAL_ENDING_WINDOW_DAYS * DAY_MS);
  if (now < windowOpen || now >= trialEnd) return;
  const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY_MS));

  const trialData = { name: displayNameFromEmail(user.email), daysLeft, trialEndsAt: trialEnd.toISOString() };
  const templateId = process.env.RESEND_TEMPLATE_TRIAL_ENDING;
  const res = templateId
    ? await sendEmailWithTemplate({ to: user.email!, templateId, variables: renderTrialEndingVars(trialData) })
    : await sendEmail({ to: user.email!, ...renderTrialEnding(trialData) });
  if (res.sent) {
    updates.lastTrialEndingSentAt = now;
    bump("trialEnding");
  }
}

// ── Payment past due ────────────────────────────────────────────────────────
async function maybePastDue(
  user: UserRow,
  now: Date,
  updates: Partial<UserRow>,
  bump: (t: string) => void,
): Promise<void> {
  if (user.subscriptionStatus !== "past_due") {
    // Reset so the NEXT distinct past_due episode re-notifies.
    if (user.lastPastDueSentAt) updates.lastPastDueSentAt = null;
    return;
  }
  if (user.lastPastDueSentAt) return; // already notified for this episode

  const pastDueData = {
    name: displayNameFromEmail(user.email),
    currentPeriodEnd: user.subscriptionCurrentPeriodEnd ? user.subscriptionCurrentPeriodEnd.toISOString() : null,
  };
  const pastDueTemplateId = process.env.RESEND_TEMPLATE_PAST_DUE;
  const res = pastDueTemplateId
    ? await sendEmailWithTemplate({ to: user.email!, templateId: pastDueTemplateId, variables: renderPastDueVars(pastDueData) })
    : await sendEmail({ to: user.email!, ...renderPastDue(pastDueData) });
  if (res.sent) {
    updates.lastPastDueSentAt = now;
    bump("pastDue");
  }
}

// ── Weekly grocery-list export nudge ────────────────────────────────────────
async function maybeListExport(
  user: UserRow,
  now: Date,
  updates: Partial<UserRow>,
  bump: (t: string) => void,
): Promise<void> {
  const cooldownDays =
    user.notifyListExportFrequency === "monthly"
      ? LIST_EXPORT_COOLDOWN_DAYS_MONTHLY
      : LIST_EXPORT_COOLDOWN_DAYS_WEEKLY;
  if (
    user.lastListExportSentAt &&
    now.getTime() - user.lastListExportSentAt.getTime() < cooldownDays * DAY_MS
  )
    return;

  const listCount = await countShoppingListItems(user.id);
  if (listCount <= 0) return;

  const listData = { name: displayNameFromEmail(user.email), itemCount: listCount };
  const listTemplateId = process.env.RESEND_TEMPLATE_LIST_EXPORT;
  const res = listTemplateId
    ? await sendEmailWithTemplate({ to: user.email!, templateId: listTemplateId, variables: renderListExportVars(listData) })
    : await sendEmail({ to: user.email!, ...renderListExport(listData) });
  if (res.sent) {
    updates.lastListExportSentAt = now;
    bump("listExport");
  }
}

// ── Receipt-upload inactivity nudge (snarky) ────────────────────────────────
async function maybeReceiptInactivity(
  user: UserRow,
  now: Date,
  lastReceiptAt: Date | null,
  updates: Partial<UserRow>,
  bump: (t: string) => void,
): Promise<void> {
  const daysSince = lastReceiptAt ? daysBetween(now, lastReceiptAt) : null;
  // Only nudge once the user has actually been inactive for the threshold. For a
  // brand-new user with zero receipts, use ACCOUNT AGE as the window so the
  // gentle first-scan prompt arrives after the same threshold — never right after
  // signup (which, combined with the global signup grace, is what caused the
  // "immediate email" bug).
  if (daysSince != null) {
    if (daysSince < RECEIPT_INACTIVITY_THRESHOLD_DAYS) return;
  } else if (daysBetween(now, new Date(user.createdAt)) < RECEIPT_INACTIVITY_THRESHOLD_DAYS) {
    return;
  }

  // Re-nudge rules: send if never sent, if they scanned since the last nudge
  // (new episode), or after the cooldown for an ongoing dry spell.
  const inactivityCooldownDays =
    user.notifyReceiptRemindersFrequency === "monthly"
      ? RECEIPT_INACTIVITY_COOLDOWN_DAYS_MONTHLY
      : RECEIPT_INACTIVITY_COOLDOWN_DAYS_WEEKLY;
  if (user.lastReceiptInactivitySentAt) {
    const sentAt = user.lastReceiptInactivitySentAt;
    const scannedSince = lastReceiptAt != null && lastReceiptAt > sentAt;
    const cooldownElapsed = now.getTime() - sentAt.getTime() >= inactivityCooldownDays * DAY_MS;
    if (!scannedSince && !cooldownElapsed) return;
  }

  const neglectedStaple = await findNeglectedStaple(user.id, now);
  const snark = buildReceiptSnark({
    userId: user.id,
    daysSinceLastReceipt: daysSince,
    neglectedStaple,
    displayName: displayNameFromEmail(user.email),
  });

  const inactivityData = {
    name: displayNameFromEmail(user.email),
    daysSinceLastReceipt: daysSince,
    headline: snark.headline,
    body: snark.body,
    neglectedStaple: neglectedStaple?.name ?? null,
  };
  const inactivityTemplateId = process.env.RESEND_TEMPLATE_RECEIPT_INACTIVITY;
  const res = inactivityTemplateId
    ? await sendEmailWithTemplate({ to: user.email!, templateId: inactivityTemplateId, variables: renderReceiptInactivityVars(inactivityData) })
    : await sendEmail({ to: user.email!, ...renderReceiptInactivity(inactivityData) });
  if (res.sent) {
    updates.lastReceiptInactivitySentAt = now;
    bump("receiptInactivity");
  }
}

// ── End-of-week / end-of-month spend summaries ──────────────────────────────
async function maybeSpendSummaries(
  user: UserRow,
  now: Date,
  receipts: SpendReceipt[],
  updates: Partial<UserRow>,
  bump: (t: string) => void,
): Promise<void> {
  const spendFrequency = user.notifySpendSummaryFrequency ?? "weekly";

  // Weekly: recap the just-completed Mon–Sun week vs the week before it. The
  // recap becomes available at the start of the current week.
  const currentWeekStart = mondayOf(now);
  const completedWeekStart = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  const priorWeekStart = new Date(completedWeekStart.getTime() - 7 * DAY_MS);
  const weeklyAlreadySent =
    user.lastWeeklySummarySentAt != null &&
    user.lastWeeklySummarySentAt >= currentWeekStart;
  // "monthly" frequency: skip weekly emails, send only the monthly recap.
  if (!weeklyAlreadySent && spendFrequency !== "monthly") {
    const total = sumReceiptsInRange(receipts, completedWeekStart, currentWeekStart);
    const previousTotal = sumReceiptsInRange(receipts, priorWeekStart, completedWeekStart);
    if (total > 0 || previousTotal > 0) {
      const cmp = comparePeriods(total, previousTotal);
      const weeklyData = {
        name: displayNameFromEmail(user.email),
        periodStart: completedWeekStart.toISOString().split("T")[0],
        periodEnd: new Date(currentWeekStart.getTime() - DAY_MS).toISOString().split("T")[0],
        ...cmp,
      };
      const weeklyTemplateId = process.env.RESEND_TEMPLATE_WEEKLY_SUMMARY;
      const res = weeklyTemplateId
        ? await sendEmailWithTemplate({ to: user.email!, templateId: weeklyTemplateId, variables: renderWeeklySummaryVars(weeklyData) })
        : await sendEmail({ to: user.email!, ...renderWeeklySummary(weeklyData) });
      if (res.sent) {
        updates.lastWeeklySummarySentAt = now;
        bump("weeklySummary");
      }
    }
  }

  // Monthly: recap the just-completed calendar month vs the month before it.
  const currentMonthStart = monthStartOf(now);
  const completedMonthStart = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() - 1,
    1,
  );
  const priorMonthStart = new Date(
    currentMonthStart.getFullYear(),
    currentMonthStart.getMonth() - 2,
    1,
  );
  const monthlyAlreadySent =
    user.lastMonthlySummarySentAt != null &&
    user.lastMonthlySummarySentAt >= currentMonthStart;
  if (!monthlyAlreadySent) {
    const total = sumReceiptsInRange(receipts, completedMonthStart, currentMonthStart);
    const previousTotal = sumReceiptsInRange(receipts, priorMonthStart, completedMonthStart);
    if (total > 0 || previousTotal > 0) {
      const cmp = comparePeriods(total, previousTotal);
      const monthlyData = {
        name: displayNameFromEmail(user.email),
        periodStart: completedMonthStart.toISOString().split("T")[0],
        periodEnd: new Date(currentMonthStart.getTime() - DAY_MS).toISOString().split("T")[0],
        ...cmp,
      };
      const monthlyTemplateId = process.env.RESEND_TEMPLATE_MONTHLY_SUMMARY;
      const res = monthlyTemplateId
        ? await sendEmailWithTemplate({ to: user.email!, templateId: monthlyTemplateId, variables: renderMonthlySummaryVars(monthlyData) })
        : await sendEmail({ to: user.email!, ...renderMonthlySummary(monthlyData) });
      if (res.sent) {
        updates.lastMonthlySummarySentAt = now;
        bump("monthlySummary");
      }
    }
  }
}

// Count items currently on the user's shopping list, mirroring the membership
// rule in routes/shoppingList.ts: an item shows if it has purchase history OR was
// explicitly added, AND is not dismissed at/after its most recent event.
// NOTE: keep this in sync with the shopping-list route's logic.
async function countShoppingListItems(userId: string): Promise<number> {
  const items = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId));
  if (!items.length) return 0;

  const lastPurchaseRows = await db
    .select({ itemId: lineItemsTable.itemId, last: max(receiptsTable.purchasedAt) })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(eq(receiptsTable.userId, userId))
    .groupBy(lineItemsTable.itemId);
  const lastPurchaseByItem = new Map<number, Date>();
  for (const row of lastPurchaseRows) {
    if (row.itemId != null && row.last) lastPurchaseByItem.set(row.itemId, new Date(row.last));
  }

  let count = 0;
  for (const item of items) {
    const lastPurchased = lastPurchaseByItem.get(item.id) ?? null;
    const addedToListAt = item.addedToListAt ?? null;
    if (!lastPurchased && !addedToListAt) continue;

    if (item.dismissedAt) {
      const events: number[] = [];
      if (lastPurchased) events.push(lastPurchased.getTime());
      if (item.ranOutAt) events.push(item.ranOutAt.getTime());
      if (addedToListAt) events.push(addedToListAt.getTime());
      const latestEvent = events.length ? Math.max(...events) : 0;
      if (item.dismissedAt.getTime() >= latestEvent) continue;
    }
    count += 1;
  }
  return count;
}

// Find a recurring staple (bought ≥2 times) the user hasn't repurchased in a
// long while, for the personalized inactivity jab. Returns the most-overdue one.
async function findNeglectedStaple(
  userId: string,
  now: Date,
): Promise<{ name: string; daysSince: number } | null> {
  const rows = await db
    .select({
      name: itemsTable.name,
      purchaseCount: itemsTable.purchaseCount,
      last: max(receiptsTable.purchasedAt),
    })
    .from(itemsTable)
    .innerJoin(lineItemsTable, eq(lineItemsTable.itemId, itemsTable.id))
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(and(eq(itemsTable.userId, userId), eq(receiptsTable.userId, userId)))
    .groupBy(itemsTable.id, itemsTable.name, itemsTable.purchaseCount);

  let best: { name: string; daysSince: number } | null = null;
  for (const row of rows) {
    if ((row.purchaseCount ?? 0) < 2 || !row.last) continue;
    const daysSince = daysBetween(now, new Date(row.last));
    if (daysSince < NEGLECTED_STAPLE_DAYS) continue;
    if (!best || daysSince > best.daysSince) best = { name: row.name, daysSince };
  }
  return best;
}
