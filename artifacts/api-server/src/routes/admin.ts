import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  storesTable,
  itemsTable,
  receiptsTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// All admin routes require an admin user.
router.use(requireAdmin);

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
      createdAt: u.createdAt.toISOString(),
      storeCount: storeMap.get(u.id) ?? 0,
      itemCount: itemMap.get(u.id) ?? 0,
      receiptCount: receiptMap.get(u.id)?.receiptCount ?? 0,
      totalSpend: Math.round(Number(receiptMap.get(u.id)?.totalSpend ?? 0) * 100) / 100,
    })),
  );
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
