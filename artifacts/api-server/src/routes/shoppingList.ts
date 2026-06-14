import { Router } from "express";
import { eq } from "drizzle-orm";
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

  // Load all purchase history for this user's items in one query instead of
  // one per item, then group in memory to avoid an N+1 pattern.
  const allPurchases = items.length
    ? await db
        .select({
          itemId: lineItemsTable.itemId,
          price: lineItemsTable.price,
          storeId: storesTable.id,
          storeName: storesTable.name,
          purchasedAt: receiptsTable.purchasedAt,
        })
        .from(lineItemsTable)
        .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
        .innerJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
        .where(eq(receiptsTable.userId, userId))
    : [];

  type PurchaseRow = (typeof allPurchases)[number];
  const purchasesByItem = new Map<number, PurchaseRow[]>();
  for (const row of allPurchases) {
    if (row.itemId == null) continue;
    const arr = purchasesByItem.get(row.itemId) ?? [];
    arr.push(row);
    purchasesByItem.set(row.itemId, arr);
  }

  for (const item of items) {
    const rows = purchasesByItem.get(item.id) ?? [];

    const addedToListAt = item.addedToListAt ?? null;

    // Items with no purchase history only appear if they were explicitly added
    // to the list (e.g. from the global catalog).
    if (!rows.length && !addedToListAt) continue;

    let averagePrice: number | null = null;
    let lowestPrice: number | null = null;
    let lowestPriceStoreName: string | null = null;
    let lastPurchasedAt: Date | null = null;

    if (rows.length) {
      const prices = rows.map((r) => Number(r.price));
      averagePrice = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
      lowestPrice = Math.min(...prices);
      lowestPriceStoreName = rows[prices.indexOf(lowestPrice)].storeName;
      lastPurchasedAt = rows.reduce<Date>(
        (max, r) => (r.purchasedAt > max ? r.purchasedAt : max),
        rows[0].purchasedAt
      );
    }

    // Dismissal: hide the item if it was dismissed AFTER the most recent
    // purchase / ran-out / add-to-list event. A newer event makes it reappear.
    if (item.dismissedAt) {
      const events: number[] = [];
      if (lastPurchasedAt) events.push(lastPurchasedAt.getTime());
      if (item.ranOutAt) events.push(item.ranOutAt.getTime());
      if (addedToListAt) events.push(addedToListAt.getTime());
      const latestEvent = events.length ? Math.max(...events) : 0;
      if (item.dismissedAt.getTime() >= latestEvent) continue;
    }

    // Recommended store/price: prefer the user's own lowest-price history; for
    // items added from the global catalog with no history, fall back to the
    // snapshot taken at add time.
    let recommendedPrice: number | null = null;
    let recommendedStoreName: string | null = null;
    let priceSource: "history" | "global" | null = null;
    if (lowestPrice != null) {
      recommendedPrice = lowestPrice;
      recommendedStoreName = lowestPriceStoreName;
      priceSource = "history";
    } else if (item.globalPrice != null) {
      recommendedPrice = Number(item.globalPrice);
      recommendedStoreName = item.globalStoreName ?? null;
      priceSource = "global";
    }

    result.push({
      itemId: item.id,
      itemName: item.name,
      icon: item.icon ?? null,
      category: item.category ?? null,
      notes: item.notes ?? null,
      purchaseCount: item.purchaseCount,
      averagePrice,
      lowestPrice,
      lowestPriceStoreName,
      recommendedPrice,
      recommendedStoreName,
      priceSource,
      addedToList: addedToListAt != null,
      isRecurring: item.purchaseCount >= 2,
      lastPurchasedAt: lastPurchasedAt ? lastPurchasedAt.toISOString() : null,
      daysSinceLastPurchase: lastPurchasedAt ? daysSince(lastPurchasedAt) : null,
      ranOutAt: item.ranOutAt ? item.ranOutAt.toISOString() : null,
    });
  }

  const recurring = result.filter((r) => r.isRecurring).sort((a, b) => a.itemName.localeCompare(b.itemName));
  const oneOff = result.filter((r) => !r.isRecurring).sort((a, b) => a.itemName.localeCompare(b.itemName));

  res.json({ recurring, oneOff });
});

export default router;
