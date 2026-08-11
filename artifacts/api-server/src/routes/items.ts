import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  itemsTable,
  lineItemsTable,
  receiptsTable,
  storesTable,
  catalogItemsTable,
} from "@workspace/db";
import { CreateItemBody, MergeItemBody } from "@workspace/api-zod";
import { isValidCategory } from "../lib/categories";
import {
  bestFuzzyMatchScored,
  SIMILARITY_THRESHOLD,
  SUGGESTION_THRESHOLD,
} from "../lib/textSimilarity";

const router = Router();

// How many names one request may ask about. A receipt has tens of lines, not
// thousands, and each name is compared against the store's whole item history.
const MAX_SUGGESTION_NAMES = 100;

const NAME_SEARCH_MIN_CHARS = 2;
const NAME_SEARCH_LIMIT = 8;

// Type-ahead for an item name.
//
// Two sources, in priority order:
//   1. The user's OWN items. Reusing an existing name keeps one item and one
//      price history instead of splitting it across near-duplicates, so these
//      always rank first.
//   2. The shared catalog — canonical names built from everyone's receipts and
//      tidied by an admin. Real product names as people actually write them.
//
// The catalog is safe to expose here because a canonical NAME is vocabulary,
// not a purchase record: no price, store, date or identity is attached. The
// region scoping and coarsening in lib/catalog.ts guard the PRICE aggregate,
// which this endpoint never touches.
router.get("/name-search", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  // Too short to be meaningful — a single letter would match half the catalog.
  if (q.length < NAME_SEARCH_MIN_CHARS) {
    res.json({ suggestions: [] });
    return;
  }

  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const own = await db
    .selectDistinct({ name: itemsTable.name })
    .from(itemsTable)
    .where(and(eq(itemsTable.userId, userId), sql`${itemsTable.name} ILIKE ${pattern}`))
    .orderBy(itemsTable.name)
    .limit(NAME_SEARCH_LIMIT);

  const seen = new Set(own.map((r) => r.name.trim().toLowerCase()));
  const suggestions: { name: string; source: "history" | "catalog" }[] = own.map((r) => ({
    name: r.name,
    source: "history",
  }));

  if (suggestions.length < NAME_SEARCH_LIMIT) {
    const shared = await db
      .selectDistinct({ name: catalogItemsTable.canonicalName })
      .from(catalogItemsTable)
      .where(sql`${catalogItemsTable.canonicalName} ILIKE ${pattern}`)
      .orderBy(catalogItemsTable.canonicalName)
      .limit(NAME_SEARCH_LIMIT);

    for (const row of shared) {
      if (suggestions.length >= NAME_SEARCH_LIMIT) break;
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ name: row.name, source: "catalog" as const });
    }
  }

  res.json({ suggestions });
});

// Suggest an existing item name for freshly-scanned lines that ALMOST match
// something already bought at this store.
//
// This exists because scan-time matching is deliberately conservative: it merges
// only at SIMILARITY_THRESHOLD, since a wrong merge silently corrupts price
// history with no confirmation step. That leaves abbreviations ("CHKN BRST")
// minting a duplicate item every scan. Here the user confirms, so the bar can be
// lower — the answer is advisory and never applied on its own.
router.post("/name-suggestions", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { storeName, names } = req.body as { storeName?: unknown; names?: unknown };

  if (typeof storeName !== "string" || !storeName.trim()) {
    res.status(400).json({ error: "storeName is required" });
    return;
  }
  if (!Array.isArray(names)) {
    res.status(400).json({ error: "names must be an array" });
    return;
  }

  const wanted = names
    .slice(0, MAX_SUGGESTION_NAMES)
    .map((n) => (typeof n === "string" ? n : ""));

  // Same candidate set the scan-time matcher uses: items this user has actually
  // bought at THIS store. A store-wide or account-wide pool would surface names
  // from shops that don't stock the product.
  const storeHistory = await db
    .selectDistinct({ id: itemsTable.id, name: itemsTable.name })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .innerJoin(itemsTable, eq(lineItemsTable.itemId, itemsTable.id))
    .innerJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .where(
      and(
        eq(receiptsTable.userId, userId),
        sql`lower(btrim(${storesTable.name})) = lower(btrim(${storeName}))`,
      ),
    );

  const suggestions: { index: number; suggestedName: string; itemId: number; score: number }[] = [];

  if (storeHistory.length > 0) {
    const known = new Set(storeHistory.map((c) => c.name.trim().toLowerCase()));
    for (const [index, name] of wanted.entries()) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      // Already exactly what we have — scan matching will reuse the item, so
      // there is nothing to ask about.
      if (known.has(trimmed.toLowerCase())) continue;

      const best = bestFuzzyMatchScored(trimmed, storeHistory, (c) => c.name);
      if (!best) continue;
      // At or above the merge bar the server will reuse the item anyway, so
      // asking would be noise. Below the suggestion floor it is probably a
      // genuinely different product.
      if (best.score >= SIMILARITY_THRESHOLD || best.score < SUGGESTION_THRESHOLD) continue;

      suggestions.push({
        index,
        suggestedName: best.candidate.name,
        itemId: best.candidate.id,
        score: Math.round(best.score * 100) / 100,
      });
    }
  }

  res.json({ suggestions });
});

router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const items = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId))
    .orderBy(itemsTable.name);
  res.json(items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })));
});

router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(itemsTable).values({ ...parsed.data, userId }).returning();
  res.status(201).json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.get("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const [item] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.patch("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Manual field handling (the generated UpdateItemBody zod predates the
  // category/brand/size fields). Each field is optional; absent = unchanged.
  const updates: Partial<typeof itemsTable.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.icon === "string") updates.icon = body.icon.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (typeof body.brand === "string") updates.brand = body.brand.trim() || null;
  if (typeof body.size === "string") updates.size = body.size.trim() || null;
  if (typeof body.category === "string") {
    if (!isValidCategory(body.category)) {
      res.status(400).json({ error: "Invalid category." });
      return;
    }
    updates.category = body.category;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }

  const [item] = await db
    .update(itemsTable)
    .set(updates)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  await db
    .delete(itemsTable)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  res.status(204).send();
});

router.post("/:id/ran-out", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const ranOutAt = new Date();
  const [item] = await db
    .update(itemsTable)
    .set({ ranOutAt })
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const [lastRow] = await db
    .select({ purchasedAt: receiptsTable.purchasedAt })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(eq(lineItemsTable.itemId, id))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC`)
    .limit(1);
  const daysSinceLastPurchase = lastRow
    ? Math.floor((Date.now() - lastRow.purchasedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  res.json({ ranOutAt: ranOutAt.toISOString(), daysSinceLastPurchase });
});

// Merge this item into another of the user's items: reassign all of this
// item's line items (purchase history) to the target, add up purchase counts,
// then delete this item. Both items must belong to the requesting user.
router.post("/:id/merge", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const parsed = MergeItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const targetId = parsed.data.targetId;
  if (targetId === id) {
    res.status(400).json({ error: "Cannot merge an item into itself" });
    return;
  }

  const [source] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  const [target] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, targetId), eq(itemsTable.userId, userId)));
  if (!source || !target) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Reassign history, combine counts, and delete the source atomically so a
  // mid-merge failure can't leave the data in a partial state.
  const merged = await db.transaction(async (tx) => {
    // Reassign the source's purchase history to the target.
    await tx
      .update(lineItemsTable)
      .set({ itemId: targetId })
      .where(eq(lineItemsTable.itemId, id));

    // Combine purchase counts and keep the target on the list.
    const [updated] = await tx
      .update(itemsTable)
      .set({
        purchaseCount: target.purchaseCount + source.purchaseCount,
        dismissedAt: null,
        ranOutAt: target.ranOutAt ?? source.ranOutAt,
      })
      .where(and(eq(itemsTable.id, targetId), eq(itemsTable.userId, userId)))
      .returning();

    await tx.delete(itemsTable).where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));

    return updated;
  });

  res.json({ ...merged, createdAt: merged.createdAt.toISOString() });
});

router.post("/:id/dismiss", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const dismissedAt = new Date();
  const [item] = await db
    .update(itemsTable)
    .set({ dismissedAt })
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ dismissedAt: dismissedAt.toISOString() });
});

// Restore an item to the active shopping list: clears both the "ran out" and
// "dismissed" markers. Powers Undo (after ran-out/dismiss) and a second tap on
// an already-marked "Ran Out" button ("I've restocked — put it back").
router.post("/:id/restore", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const [item] = await db
    .update(itemsTable)
    .set({ ranOutAt: null, dismissedAt: null })
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ restored: true });
});

export default router;
