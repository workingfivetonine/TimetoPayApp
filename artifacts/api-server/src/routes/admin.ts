import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  usersTable,
  storesTable,
  itemsTable,
  receiptsTable,
  lineItemsTable,
} from "@workspace/db";
import { AdminSetUserRoleBody, AdminMergeUsersBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { normalizeName } from "../lib/catalog";
import { computeEntitlement } from "../lib/billing/entitlement";

const router = Router();

// All admin routes require an admin user.
router.use(requireAdmin);

// Thrown inside a transaction when a guard fails (e.g. attempting to delete the
// master admin). Mapped to a 400 by the caller; anything else rolls back as 500.
class AdminGuardError extends Error {}

// Best-effort deletion of a Clerk user. Swallows "already gone" so DB cleanup
// can still proceed; rethrows nothing (logged by caller via return value).
async function deleteClerkUser(userId: string, log?: { warn: (o: object, m: string) => void }): Promise<void> {
  try {
    await clerkClient.users.deleteUser(userId);
  } catch (err) {
    // The Clerk account may already be gone; proceed with local cleanup.
    log?.warn({ err, userId }, "Failed to delete Clerk user (continuing)");
  }
}

// Compute the AdminUser summary shape for a single user.
async function buildAdminUser(userId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return null;
  const [r] = await db
    .select({
      receiptCount: sql<number>`count(*)::int`,
      totalSpend: sql<string>`coalesce(sum(${receiptsTable.total}), 0)`,
    })
    .from(receiptsTable)
    .where(eq(receiptsTable.userId, userId));
  const [s] = await db
    .select({ storeCount: sql<number>`count(*)::int` })
    .from(storesTable)
    .where(eq(storesTable.userId, userId));
  const [i] = await db
    .select({ itemCount: sql<number>`count(*)::int` })
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId));
  return {
    id: u.id,
    email: u.email,
    isAdmin: u.isAdmin,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    storeCount: s?.storeCount ?? 0,
    itemCount: i?.itemCount ?? 0,
    receiptCount: r?.receiptCount ?? 0,
    totalSpend: Math.round(Number(r?.totalSpend ?? 0) * 100) / 100,
  };
}

// List all users with a summary of their data.
router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  const receiptStats = await db
    .select({
      userId: receiptsTable.userId,
      receiptCount: sql<number>`count(*)::int`,
      totalSpend: sql<string>`coalesce(sum(${receiptsTable.total}), 0)`,
    })
    .from(receiptsTable)
    .groupBy(receiptsTable.userId);

  const storeStats = await db
    .select({ userId: storesTable.userId, storeCount: sql<number>`count(*)::int` })
    .from(storesTable)
    .groupBy(storesTable.userId);

  const itemStats = await db
    .select({ userId: itemsTable.userId, itemCount: sql<number>`count(*)::int` })
    .from(itemsTable)
    .groupBy(itemsTable.userId);

  const receiptMap = new Map(receiptStats.map((r) => [r.userId, r]));
  const storeMap = new Map(storeStats.map((s) => [s.userId, s.storeCount]));
  const itemMap = new Map(itemStats.map((i) => [i.userId, i.itemCount]));

  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      storeCount: storeMap.get(u.id) ?? 0,
      itemCount: itemMap.get(u.id) ?? 0,
      receiptCount: receiptMap.get(u.id)?.receiptCount ?? 0,
      totalSpend: Math.round(Number(receiptMap.get(u.id)?.totalSpend ?? 0) * 100) / 100,
    })),
  );
});

// List all users with their subscription/entitlement status (trial/active/etc.)
// and the provider backing it. Mirrors computeEntitlement so the admin view
// matches exactly what each user is gated on.
router.get("/subscribers", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(
    users.map((u) => {
      const e = computeEntitlement(u);
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        status: e.status,
        provider: e.provider,
        entitled: e.entitled,
        currentPeriodEnd: e.currentPeriodEnd,
        createdAt: u.createdAt.toISOString(),
      };
    }),
  );
});

// Set a user's type/role. Assigning "master_admin" transfers admin rights:
// the current master admin is demoted to "general" and the target becomes the
// single master admin (kept in lockstep with the is_admin power flag).
router.patch("/users/:userId/role", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const parsed = AdminSetUserRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const { role } = parsed.data;

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (role === "master_admin") {
    if (target.isAdmin) {
      // Already the master admin — nothing to transfer.
      res.json(await buildAdminUser(userId));
      return;
    }
    // Transfer: demote the current master(s), then promote the target. Order
    // matters — clearing is_admin first keeps the single-admin unique index
    // happy. We lock the target row up front and assert the promote actually
    // updated it, so a concurrent delete of the target can never leave the app
    // with zero admins (the whole transfer rolls back instead).
    const ok = await db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update");
      if (locked.length === 0) return false;

      await tx
        .update(usersTable)
        .set({ isAdmin: false, role: "general" })
        .where(eq(usersTable.isAdmin, true));
      const promoted = await tx
        .update(usersTable)
        .set({ isAdmin: true, role: "master_admin" })
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id });
      if (promoted.length !== 1) {
        throw new Error("Admin transfer failed to promote target");
      }
      return true;
    });
    if (!ok) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(await buildAdminUser(userId));
    return;
  }

  // Demoting to family/general. Refuse to demote the current master admin
  // directly — that would leave the app with no admin. Transfer master_admin to
  // another user first.
  if (target.isAdmin) {
    res.status(400).json({
      error:
        "Can't change the master admin's type. Assign master admin to another user to transfer it first.",
    });
    return;
  }

  await db.update(usersTable).set({ role }).where(eq(usersTable.id, userId));
  res.json(await buildAdminUser(userId));
});

// Merge one user's data into another, then delete the source user. Stores and
// items are deduplicated by normalized name so the target never ends up with
// duplicate personal rows.
router.post("/users/merge", async (req, res): Promise<void> => {
  const parsed = AdminMergeUsersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { sourceUserId, targetUserId } = parsed.data;

  if (sourceUserId === targetUserId) {
    res.status(400).json({ error: "Cannot merge a user into themselves" });
    return;
  }

  const [source] = await db.select().from(usersTable).where(eq(usersTable.id, sourceUserId));
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
  if (!source || !target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (source.isAdmin) {
    res.status(400).json({
      error: "Can't merge the master admin. Transfer master admin to another user first.",
    });
    return;
  }

  let result: { movedStores: number; movedItems: number; movedReceipts: number };
  try {
    result = await db.transaction(async (tx) => {
    // Lock the source row and re-check inside the txn: a concurrent role
    // transfer could have made it the master admin after the check above. The
    // lock serializes against the transfer (which also locks the row), so we
    // never delete the sole admin and leave the app admin-less.
    const [lockedSource] = await tx
      .select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, sourceUserId))
      .for("update");
    if (!lockedSource) throw new AdminGuardError("User not found");
    if (lockedSource.isAdmin) {
      throw new AdminGuardError(
        "Can't merge the master admin. Transfer master admin to another user first.",
      );
    }

    const [receiptCountRow] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(receiptsTable)
      .where(eq(receiptsTable.userId, sourceUserId));
    const movedReceipts = receiptCountRow?.c ?? 0;

    // --- Stores: dedup by normalized name ---
    const targetStores = await tx
      .select({ id: storesTable.id, name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.userId, targetUserId));
    const storeByNorm = new Map<string, number>();
    for (const s of targetStores) storeByNorm.set(normalizeName(s.name), s.id);

    const sourceStores = await tx
      .select({ id: storesTable.id, name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.userId, sourceUserId));
    for (const s of sourceStores) {
      const norm = normalizeName(s.name);
      const existingId = storeByNorm.get(norm);
      if (existingId) {
        // Repoint this source store's receipts to the target's store, drop dup.
        await tx
          .update(receiptsTable)
          .set({ storeId: existingId })
          .where(eq(receiptsTable.storeId, s.id));
        await tx.delete(storesTable).where(eq(storesTable.id, s.id));
      } else {
        await tx.update(storesTable).set({ userId: targetUserId }).where(eq(storesTable.id, s.id));
        storeByNorm.set(norm, s.id);
      }
    }
    const movedStores = sourceStores.length;

    // --- Items: dedup by normalized name (merge purchase counts) ---
    const targetItems = await tx
      .select({ id: itemsTable.id, name: itemsTable.name, purchaseCount: itemsTable.purchaseCount })
      .from(itemsTable)
      .where(eq(itemsTable.userId, targetUserId));
    const itemByNorm = new Map<string, { id: number; purchaseCount: number }>();
    for (const i of targetItems) itemByNorm.set(normalizeName(i.name), { id: i.id, purchaseCount: i.purchaseCount });

    const sourceItems = await tx
      .select({ id: itemsTable.id, name: itemsTable.name, purchaseCount: itemsTable.purchaseCount })
      .from(itemsTable)
      .where(eq(itemsTable.userId, sourceUserId));
    for (const i of sourceItems) {
      const norm = normalizeName(i.name);
      const existing = itemByNorm.get(norm);
      if (existing) {
        await tx
          .update(lineItemsTable)
          .set({ itemId: existing.id })
          .where(eq(lineItemsTable.itemId, i.id));
        const newCount = existing.purchaseCount + i.purchaseCount;
        await tx.update(itemsTable).set({ purchaseCount: newCount }).where(eq(itemsTable.id, existing.id));
        existing.purchaseCount = newCount;
        await tx.delete(itemsTable).where(eq(itemsTable.id, i.id));
      } else {
        await tx.update(itemsTable).set({ userId: targetUserId }).where(eq(itemsTable.id, i.id));
        itemByNorm.set(norm, { id: i.id, purchaseCount: i.purchaseCount });
      }
    }
    const movedItems = sourceItems.length;

    // Move any remaining source receipts to the target, then drop the source
    // user. The conditional predicate is belt-and-suspenders on top of the row
    // lock: never delete a user that is (still) the master admin.
    await tx.update(receiptsTable).set({ userId: targetUserId }).where(eq(receiptsTable.userId, sourceUserId));
    const deleted = await tx
      .delete(usersTable)
      .where(and(eq(usersTable.id, sourceUserId), eq(usersTable.isAdmin, false)))
      .returning({ id: usersTable.id });
    if (deleted.length !== 1) {
      throw new AdminGuardError(
        "Can't merge the master admin. Transfer master admin to another user first.",
      );
    }

    return { movedStores, movedItems, movedReceipts };
    });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.message === "User not found" ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    throw err;
  }

  await deleteClerkUser(sourceUserId, req.log);

  res.json({ targetUserId, ...result });
});

// Delete a user and all their data (cascade removes stores/items/receipts).
router.delete("/users/:userId", async (req, res): Promise<void> => {
  const { userId } = req.params;

  if (userId === req.userId) {
    res.status(400).json({ error: "You can't delete your own account" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.isAdmin) {
    res.status(400).json({
      error: "Can't delete the master admin. Transfer master admin to another user first.",
    });
    return;
  }

  // Conditional delete guards against a concurrent master-admin transfer onto
  // this user between the check above and the delete: only deletes if the user
  // is still non-admin, so we can never remove the sole admin. Do the DB delete
  // first so a lost race doesn't orphan the Clerk account.
  const deleted = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.isAdmin, false)))
    .returning({ id: usersTable.id });
  if (deleted.length === 0) {
    res.status(400).json({
      error: "Can't delete the master admin. Transfer master admin to another user first.",
    });
    return;
  }

  await deleteClerkUser(userId, req.log);

  res.json({ success: true });
});

// Read-only view of a specific user's receipts.
router.get("/users/:userId/receipts", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const rows = await db
    .select({ receipt: receiptsTable, storeName: storesTable.name })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .where(eq(receiptsTable.userId, userId))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC`);

  res.json({
    userId: user.id,
    email: user.email,
    receipts: rows.map((r) => ({
      id: r.receipt.id,
      storeName: r.storeName ?? "Unknown",
      total: Number(r.receipt.total),
      purchasedAt: r.receipt.purchasedAt.toISOString(),
      notes: r.receipt.notes ?? null,
      createdAt: r.receipt.createdAt.toISOString(),
    })),
  });
});

export default router;
