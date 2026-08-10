import { Router } from "express";
import { and, eq, inArray, isNotNull, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { lineItemsTable, receiptsTable, storesTable, itemsTable, shoppingTripsTable, savedShoppingListsTable, savedShoppingListItemsTable } from "@workspace/db";
import { isRealPrice, priceStats } from "../lib/prices";
import { iconForItemName } from "../lib/itemIcon";
import { categoryForItemName } from "../lib/categories";

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

// GET /shopping-list/saved-lists — list all user's saved lists
router.get("/saved-lists", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const lists = await db
    .select({
      id: savedShoppingListsTable.id,
      name: savedShoppingListsTable.name,
      createdAt: savedShoppingListsTable.createdAt,
      updatedAt: savedShoppingListsTable.updatedAt,
    })
    .from(savedShoppingListsTable)
    .where(eq(savedShoppingListsTable.userId, userId))
    .orderBy(desc(savedShoppingListsTable.updatedAt));

  // Count items per list
  const result = await Promise.all(
    lists.map(async (list) => {
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(savedShoppingListItemsTable)
        .where(eq(savedShoppingListItemsTable.savedListId, list.id));
      return {
        ...list,
        itemCount: Number(row?.count ?? 0),
        createdAt: list.createdAt?.toISOString(),
        updatedAt: list.updatedAt?.toISOString(),
      };
    }),
  );

  res.json(result);
});

// POST /shopping-list/saved-lists — create a new saved list
router.post("/saved-lists", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { name, items } = req.body as { name?: unknown; items?: unknown };

  // Minimal validation
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  if (!Array.isArray(items)) {
    res.status(400).json({ error: "items must be an array" });
    return;
  }

  // Insert in a transaction
  const [list] = await db
    .insert(savedShoppingListsTable)
    .values({ userId, name: name.trim() })
    .returning({ id: savedShoppingListsTable.id, createdAt: savedShoppingListsTable.createdAt, updatedAt: savedShoppingListsTable.updatedAt });

  // Insert items
  if (items.length > 0) {
    const itemsToInsert = (items as Array<Record<string, unknown>>).map((item) => ({
      savedListId: list.id,
      itemId: typeof item.itemId === "number" ? item.itemId : null,
      itemName: String(item.itemName || ""),
      quantity: typeof item.quantity === "number" ? item.quantity : null,
    }));
    await db.insert(savedShoppingListItemsTable).values(itemsToInsert);
  }

  res.status(201).json({
    id: list.id,
    name: name.trim(),
    itemCount: items.length,
    createdAt: list.createdAt?.toISOString(),
    updatedAt: list.updatedAt?.toISOString(),
  });
});

// GET /shopping-list/saved-lists/:id — get full saved list with items
router.get("/saved-lists/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);

  const [list] = await db
    .select()
    .from(savedShoppingListsTable)
    .where(and(eq(savedShoppingListsTable.id, id), eq(savedShoppingListsTable.userId, userId)));

  if (!list) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const items = await db
    .select()
    .from(savedShoppingListItemsTable)
    .where(eq(savedShoppingListItemsTable.savedListId, id));

  res.json({
    id: list.id,
    name: list.name,
    items: items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      itemName: item.itemName,
      quantity: item.quantity,
    })),
    createdAt: list.createdAt?.toISOString(),
    updatedAt: list.updatedAt?.toISOString(),
  });
});

// PATCH /shopping-list/saved-lists/:id — rename a list
router.patch("/saved-lists/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);
  const { name } = req.body as { name?: unknown };

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [list] = await db
    .update(savedShoppingListsTable)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(and(eq(savedShoppingListsTable.id, id), eq(savedShoppingListsTable.userId, userId)))
    .returning({ id: savedShoppingListsTable.id, createdAt: savedShoppingListsTable.createdAt, updatedAt: savedShoppingListsTable.updatedAt });

  if (!list) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Count items
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(savedShoppingListItemsTable)
    .where(eq(savedShoppingListItemsTable.savedListId, id));

  res.json({
    id: list.id,
    name: name.trim(),
    itemCount: Number(row?.count ?? 0),
    createdAt: list.createdAt?.toISOString(),
    updatedAt: list.updatedAt?.toISOString(),
  });
});

// DELETE /shopping-list/saved-lists/:id — delete a list (cascade deletes items)
router.delete("/saved-lists/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);

  // Verify ownership before deleting
  const [list] = await db
    .select({ id: savedShoppingListsTable.id })
    .from(savedShoppingListsTable)
    .where(and(eq(savedShoppingListsTable.id, id), eq(savedShoppingListsTable.userId, userId)));

  if (!list) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(savedShoppingListsTable).where(eq(savedShoppingListsTable.id, id));
  res.status(204).send();
});

// POST /shopping-list/saved-lists/:id/apply — add all items from the list to user's shopping list
router.post("/saved-lists/:id/apply", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);

  const [list] = await db
    .select({ id: savedShoppingListsTable.id })
    .from(savedShoppingListsTable)
    .where(and(eq(savedShoppingListsTable.id, id), eq(savedShoppingListsTable.userId, userId)));

  if (!list) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const items = await db
    .select()
    .from(savedShoppingListItemsTable)
    .where(eq(savedShoppingListItemsTable.savedListId, id));

  let addedCount = 0;
  const now = new Date();

  for (const item of items) {
    if (item.itemId != null) {
      // Check that the item still belongs to this user
      const [userItem] = await db
        .select({ id: itemsTable.id })
        .from(itemsTable)
        .where(and(eq(itemsTable.id, item.itemId), eq(itemsTable.userId, userId)));

      if (userItem) {
        // Restore it (clear dismissed, set addedToListAt)
        await db
          .update(itemsTable)
          .set({ addedToListAt: now, dismissedAt: null })
          .where(eq(itemsTable.id, userItem.id));
        addedCount++;
        continue;
      }
    }

    // itemId is null or doesn't belong to user: match by exact case-insensitive name
    const [existing] = await db
      .select({ id: itemsTable.id })
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.userId, userId),
          sql`lower(${itemsTable.name}) = lower(${item.itemName})`,
        ),
      );

    if (existing) {
      // Update existing
      await db
        .update(itemsTable)
        .set({ addedToListAt: now, dismissedAt: null })
        .where(eq(itemsTable.id, existing.id));
      addedCount++;
    } else {
      // Create new item
      const [newItem] = await db
        .insert(itemsTable)
        .values({
          userId,
          name: item.itemName,
          icon: iconForItemName(item.itemName),
          category: categoryForItemName(item.itemName),
          addedToListAt: now,
          purchaseCount: 0,
        })
        .returning({ id: itemsTable.id });

      if (newItem) addedCount++;
    }
  }

  res.json({ addedCount });
});

export default router;
