import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { UpdateMyRegionBody } from "@workspace/api-zod";
import { validateRegion } from "@workspace/geo";
import { formatCurrentUser } from "../lib/billing/entitlement";

const router = Router();

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

export default router;
