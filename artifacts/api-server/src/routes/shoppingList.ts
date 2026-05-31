import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { lineItemsTable, receiptsTable, storesTable, itemsTable } from "@workspace/db";

const router = Router();

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const items = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId))
    .orderBy(itemsTable.name);

  const result = [];

  for (const item of items) {
    const rows = await db
      .select({
        price: lineItemsTable.price,
        storeId: storesTable.id,
        storeName: storesTable.name,
        purchasedAt: receiptsTable.purchasedAt,
      })
      .from(lineItemsTable)
      .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
      .innerJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
      .where(and(eq(lineItemsTable.itemId, item.id), eq(receiptsTable.userId, userId)));

    if (!rows.length) continue;

    const prices = rows.map((r) => Number(r.price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const lowestPrice = Math.min(...prices);
    const lowestRow = rows[prices.indexOf(lowestPrice)];

    const lastPurchasedAt = rows.reduce<Date>(
      (max, r) => (r.purchasedAt > max ? r.purchasedAt : max),
      rows[0].purchasedAt
    );

    result.push({
      itemId: item.id,
      itemName: item.name,
      icon: item.icon ?? null,
      notes: item.notes ?? null,
      purchaseCount: item.purchaseCount,
      averagePrice: Math.round(avgPrice * 100) / 100,
      lowestPrice,
      lowestPriceStoreName: lowestRow.storeName,
      isRecurring: item.purchaseCount >= 2,
      lastPurchasedAt: lastPurchasedAt.toISOString(),
      daysSinceLastPurchase: daysSince(lastPurchasedAt),
      ranOutAt: item.ranOutAt ? item.ranOutAt.toISOString() : null,
    });
  }

  const recurring = result.filter((r) => r.isRecurring).sort((a, b) => a.itemName.localeCompare(b.itemName));
  const oneOff = result.filter((r) => !r.isRecurring).sort((a, b) => a.itemName.localeCompare(b.itemName));

  res.json({ recurring, oneOff });
});

export default router;
