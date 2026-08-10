import { Router } from "express";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { lineItemsTable, receiptsTable, storesTable, itemsTable, shoppingTripsTable } from "@workspace/db";
import { isRealPrice, priceStats } from "../lib/prices";

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
      // Only rows with a real price count toward the price stats — a blank
      // price stored as 0.00 is not a price you could shop at. See lib/prices.ts.
      const priced = rows.filter((r) => isRealPrice(r.price));
      const stats = priceStats(priced.map((r) => Number(r.price)));

      if (stats) {
        averagePrice = stats.average;
        lowestPrice = stats.lowest;
        lowestPriceStoreName = priced[stats.lowestIndex]!.storeName;
      }

      // Dates come from EVERY row, priced or not: buying something without
      // recording the price is still buying it, so it must still count for
      // "last purchased" and for the dismissal comparison below.
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

// POST /shopping-list/trips — record a finished shopping trip.
//
// Called when the user taps "Done shopping" in Shopping Mode. Only closed trips
// are stored: an abandoned trip never reaches the server, so it can never turn
// into a reminder for shopping that didn't happen.
router.post("/trips", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { itemsPicked, itemsPlanned, pickedItemIds } = req.body as {
    itemsPicked?: unknown;
    itemsPlanned?: unknown;
    pickedItemIds?: unknown;
  };

  // Counts are cosmetic (they only colour the reminder copy), so a bad value is
  // clamped rather than 400'd — losing the trip record would cost the user their
  // reminder over a detail that doesn't matter.
  const toCount = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 10_000) : 0;

  const [trip] = await db
    .insert(shoppingTripsTable)
    .values({
      userId,
      itemsPicked: toCount(itemsPicked),
      itemsPlanned: toCount(itemsPlanned),
    })
    .returning({ id: shoppingTripsTable.id, closedAt: shoppingTripsTable.closedAt });

  // Finishing a trip with an item still ticked means it went in the basket, so
  // it is no longer "run out". Ticking alone does NOT do this — a tick is
  // reversible while you shop, and only closing the trip commits it.
  //
  // Clears ranOutAt only. `dismissedAt` is a separate decision ("stop showing me
  // this") that buying the item does not reverse, and lastPurchased belongs to
  // receipt data — nothing here should invent a purchase record from a checkbox.
  const ids = Array.isArray(pickedItemIds)
    ? [...new Set(pickedItemIds.filter((v): v is number => typeof v === "number" && Number.isInteger(v)))].slice(0, 500)
    : [];

  let cleared = 0;
  if (ids.length > 0) {
    const rows = await db
      .update(itemsTable)
      .set({ ranOutAt: null })
      .where(
        and(
          eq(itemsTable.userId, userId),
          inArray(itemsTable.id, ids),
          isNotNull(itemsTable.ranOutAt),
        ),
      )
      .returning({ id: itemsTable.id });
    cleared = rows.length;
  }

  res.status(201).json({ id: trip!.id, closedAt: trip!.closedAt.toISOString(), ranOutCleared: cleared });
});

export default router;
