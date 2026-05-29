import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { lineItemsTable, receiptsTable, storesTable, itemsTable } from "@workspace/db";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const items = await db.select().from(itemsTable).orderBy(itemsTable.name);

  const result = [];

  for (const item of items) {
    const rows = await db
      .select({
        price: lineItemsTable.price,
        storeId: storesTable.id,
        storeName: storesTable.name,
      })
      .from(lineItemsTable)
      .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
      .innerJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
      .where(eq(lineItemsTable.itemId, item.id));

    if (!rows.length) continue;

    const prices = rows.map((r) => Number(r.price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const lowestPrice = Math.min(...prices);
    const lowestRow = rows[prices.indexOf(lowestPrice)];

    result.push({
      itemId: item.id,
      itemName: item.name,
      notes: item.notes ?? null,
      purchaseCount: item.purchaseCount,
      averagePrice: Math.round(avgPrice * 100) / 100,
      lowestPrice,
      lowestPriceStoreName: lowestRow.storeName,
      isRecurring: item.purchaseCount >= 2,
    });
  }

  const recurring = result.filter((r) => r.isRecurring).sort((a, b) => a.itemName.localeCompare(b.itemName));
  const oneOff = result.filter((r) => !r.isRecurring).sort((a, b) => a.itemName.localeCompare(b.itemName));

  res.json({ recurring, oneOff });
});

export default router;
