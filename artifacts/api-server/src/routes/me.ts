import { Router } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { UpdateMyRegionBody, UpdateMyNotificationPreferencesBody } from "@workspace/api-zod";
import { validateRegion } from "@workspace/geo";
import { formatCurrentUser } from "../lib/billing/entitlement";
import {
  isValidUsernameFormat,
  isUsernameAvailable,
  generateUniqueUsername,
} from "../lib/username";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import { cancelUserSubscription } from "../lib/billing/cancelSubscription";
import { sendAccountDeletedEmail, sendWelcomeEmail } from "../lib/email/transactional";

const router = Router();

type UserRow = typeof usersTable.$inferSelect;

function formatNotificationPreferences(user: UserRow) {
  return {
    notifyPaymentReminders: user.notifyPaymentReminders,
    notifyListExport: user.notifyListExport,
    notifyReceiptReminders: user.notifyReceiptReminders,
    notifySpendSummary: user.notifySpendSummary,
    notifyListExportFrequency: (user.notifyListExportFrequency ?? "weekly") as "weekly" | "monthly",
    notifyReceiptRemindersFrequency: (user.notifyReceiptRemindersFrequency ?? "weekly") as "weekly" | "monthly",
    notifySpendSummaryFrequency: (user.notifySpendSummaryFrequency ?? "weekly") as "weekly" | "monthly",
  };
}

// Returns the currently authenticated user (provisioned by requireAuth).
router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatCurrentUser(user));
});

// DELETE /me — self-service account + data deletion (GDPR right to erasure).
// Deleting the users row cascades to the user's receipts, items, stores, line
// items, and board posts/replies/agrees/thanks (ON DELETE CASCADE), then the
// Clerk identity is removed. Admins can't self-delete (single-admin invariant).
router.delete("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.isAdmin) {
    res.status(403).json({ error: "Admin accounts can't be deleted from here." });
    return;
  }
  // Cancel any active subscription FIRST so a deleted account stops billing.
  const subscriptionCancelled = !!(user.stripeSubscriptionId || user.paypalSubscriptionId);
  await cancelUserSubscription(user);
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  try {
    await clerkClient.users.deleteUser(userId);
  } catch (err) {
    // The app data is already gone; a failed Clerk delete is non-fatal (the
    // orphaned Clerk identity simply re-provisions an empty account on next login).
    logger.error({ err, userId }, "Clerk user deletion failed after account delete");
  }
  if (user.email) void sendAccountDeletedEmail(user.email, subscriptionCancelled);
  res.json({ deleted: true });
});

// Set the authenticated user's region. Country must be a known ISO-3166 alpha-2
// code; for the US a valid state is required, and for every other country any
// provided state is dropped (state scoping is US-only).
router.patch("/region", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpdateMyRegionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const region = validateRegion(parsed.data.countryCode, parsed.data.stateCode);
  if (!region.ok) {
    res.status(400).json({ error: region.error });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ countryCode: region.countryCode, stateCode: region.stateCode })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatCurrentUser(user));
});

// Returns the authenticated user's email reminder preferences.
router.get("/notifications", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatNotificationPreferences(user));
});

// Partial update of the authenticated user's email reminder preferences. Only
// the toggles present in the body are changed.
router.patch("/notifications", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpdateMyNotificationPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<UserRow> = {};
  if (parsed.data.notifyPaymentReminders !== undefined)
    updates.notifyPaymentReminders = parsed.data.notifyPaymentReminders;
  if (parsed.data.notifyListExport !== undefined)
    updates.notifyListExport = parsed.data.notifyListExport;
  if (parsed.data.notifyReceiptReminders !== undefined)
    updates.notifyReceiptReminders = parsed.data.notifyReceiptReminders;
  if (parsed.data.notifySpendSummary !== undefined)
    updates.notifySpendSummary = parsed.data.notifySpendSummary;
  if (parsed.data.notifyListExportFrequency !== undefined)
    updates.notifyListExportFrequency = parsed.data.notifyListExportFrequency;
  if (parsed.data.notifyReceiptRemindersFrequency !== undefined)
    updates.notifyReceiptRemindersFrequency = parsed.data.notifyReceiptRemindersFrequency;
  if (parsed.data.notifySpendSummaryFrequency !== undefined)
    updates.notifySpendSummaryFrequency = parsed.data.notifySpendSummaryFrequency;

  if (!Object.keys(updates).length) {
    // Nothing to change — just return current prefs.
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(formatNotificationPreferences(user));
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatNotificationPreferences(user));
});

// ── Public profile (username / name / avatar) ────────────────────────────────

// GET /me/username-available?username=foo — live availability + format check.
router.get("/username-available", async (req, res): Promise<void> => {
  const username = String(req.query.username ?? "").trim();
  if (!isValidUsernameFormat(username)) {
    res.json({ valid: false, available: false });
    return;
  }
  res.json({ valid: true, available: await isUsernameAvailable(username) });
});

// GET /me/username-suggestion — a fresh, currently-unique ridiculous handle.
router.get("/username-suggestion", async (_req, res): Promise<void> => {
  res.json({ username: await generateUniqueUsername() });
});

// PATCH /me/profile — set the username (required) + optional first/last name and
// avatar. Completes the profile-setup onboarding step.
router.patch("/profile", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = (req.body ?? {}) as {
    username?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    avatar?: unknown;
  };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const avatar = typeof body.avatar === "string" ? body.avatar.trim() : "";

  if (!isValidUsernameFormat(username)) {
    res.status(400).json({ error: "Username must be 3–20 letters, numbers, or underscores." });
    return;
  }
  const taken = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(sql`lower(${usersTable.username}) = lower(${username})`, ne(usersTable.id, userId)))
    .limit(1);
  if (taken.length > 0) {
    res.status(409).json({ error: "That username is taken." });
    return;
  }
  // First-time profile completion (no username yet) → send the welcome email
  // here, where we know the user's chosen name, instead of at first login.
  const [prior] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const isFirstProfile = !prior?.username;
  try {
    const [user] = await db
      .update(usersTable)
      .set({
        username,
        firstName: firstName || null,
        lastName: lastName || null,
        avatar: avatar || null,
      })
      .where(eq(usersTable.id, userId))
      .returning();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (isFirstProfile && user.email) {
      void sendWelcomeEmail(user.email, firstName || username);
    }
    res.json(formatCurrentUser(user));
  } catch {
    // Unique-index race — treat as taken.
    res.status(409).json({ error: "That username is taken." });
  }
});

export default router;
