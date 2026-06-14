import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { UpdateMyRegionBody, UpdateMyNotificationPreferencesBody } from "@workspace/api-zod";
import { validateRegion } from "@workspace/geo";
import { formatCurrentUser } from "../lib/billing/entitlement";

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

export default router;
