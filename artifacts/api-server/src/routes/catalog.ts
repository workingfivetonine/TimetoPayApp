import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  itemsTable,
  catalogItemsTable,
  catalogItemAliasesTable,
  lineItemsTable,
  receiptsTable,
} from "@workspace/db";
import { AddCatalogItemToListBody } from "@workspace/api-zod";
import { ensureCatalog, computeGlobalPrices, normalizeName } from "../lib/catalog";
import { categoryOrder } from "../lib/categories";

const router = Router();

// Map a catalog item id -> the set of its alias normalized names.
async function aliasNormsByItem(): Promise<Map<number, string[]>> {
  const aliases = await db
    .select({
      normalizedName: catalogItemAliasesTable.normalizedName,
      catalogItemId: catalogItemAliasesTable.catalogItemId,
    })
    .from(catalogItemAliasesTable);
  const normsByItem = new Map<number, string[]>();
  for (const a of aliases) {
    const list = normsByItem.get(a.catalogItemId);
    if (list) list.push(a.normalizedName);
    else normsByItem.set(a.catalogItemId, [a.normalizedName]);
  }
  return normsByItem;
}

// Browse the global price catalog, grouped by category. Available to every
// authenticated user (not just admin). Never exposes who bought what.
router.get("/browse", async (req, res): Promise<void> => {
  const userId = req.userId!;
  await ensureCatalog();
  const global = await computeGlobalPrices();

  // The user's items plus their latest purchase date, to determine which
  // items are CURRENTLY on the shopping list. Membership mirrors the shopping
  // list endpoint: an item is on the list if it has purchase history OR was
  // explicitly added, and is not dismissed after its most recent event.
  const userItems = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      addedToListAt: itemsTable.addedToListAt,
      dismissedAt: itemsTable.dismissedAt,
      ranOutAt: itemsTable.ranOutAt,
    })
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId));

  const histRows = await db
    .select({ itemId: lineItemsTable.itemId, purchasedAt: receiptsTable.purchasedAt })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(eq(receiptsTable.userId, userId));
  const lastPurchaseByItem = new Map<number, number>();
  for (const r of histRows) {
    const t = r.purchasedAt.getTime();
    const prev = lastPurchaseByItem.get(r.itemId);
    if (prev == null || t > prev) lastPurchaseByItem.set(r.itemId, t);
  }

  const inListNorms = new Set<string>();
  for (const i of userItems) {
    const lastPurchased = lastPurchaseByItem.get(i.id) ?? null;
    const addedAt = i.addedToListAt ? i.addedToListAt.getTime() : null;
    // Not on the list at all unless it has history or was added explicitly.
    if (lastPurchased == null && addedAt == null) continue;
    // Hidden if dismissed at/after the most recent event.
    if (i.dismissedAt) {
      const events: number[] = [];
      if (lastPurchased != null) events.push(lastPurchased);
      if (i.ranOutAt) events.push(i.ranOutAt.getTime());
      if (addedAt != null) events.push(addedAt);
      const latestEvent = events.length ? Math.max(...events) : 0;
      if (i.dismissedAt.getTime() >= latestEvent) continue;
    }
    inListNorms.add(normalizeName(i.name));
  }

  const normsByItem = await aliasNormsByItem();

  const items = global.map((g) => {
    const best = g.stores.length ? g.stores[0] : null;
    const norms = normsByItem.get(g.catalogItemId) ?? [];
    const inList = norms.some((n) => inListNorms.has(n));
    return {
      catalogItemId: g.catalogItemId,
      name: g.name,
      icon: g.icon,
      category: g.category,
      bestPrice: best ? best.latestPrice : null,
      bestStoreName: best ? best.storeName : null,
      inList,
      stores: g.stores,
    };
  });

  const byCategory = new Map<string, typeof items>();
  for (const it of items) {
    const cat = it.category ?? "Other";
    const list = byCategory.get(cat);
    if (list) list.push(it);
    else byCategory.set(cat, [it]);
  }

  const categories = Array.from(byCategory.entries())
    .map(([category, catItems]) => ({
      category,
      items: catItems.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const o = categoryOrder(a.category) - categoryOrder(b.category);
      return o !== 0 ? o : a.category.localeCompare(b.category);
    });

  res.json({ categories });
});

// Add a catalog item to the current user's shopping list. Finds or creates the
// user's own item (by normalized name) and snapshots the global price/store.
router.post("/add-to-list", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = AddCatalogItemToListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureCatalog();

  const [canonical] = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.id, parsed.data.catalogItemId));
  if (!canonical) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }

  // Snapshot the current global best price/store for this canonical item.
  const global = await computeGlobalPrices();
  const entry = global.find((g) => g.catalogItemId === canonical.id);
  const best = entry && entry.stores.length ? entry.stores[0] : null;
  const globalPrice = best ? String(best.latestPrice) : null;
  const globalStoreName = best ? best.storeName : null;

  const now = new Date();

  // Match the user's existing item against ANY normalized alias of this
  // canonical item (not just the canonical name), so we update/reuse rather
  // than creating a duplicate when the user already owns a spelling variant.
  const normsByItem = await aliasNormsByItem();
  const candidateNorms = new Set(normsByItem.get(canonical.id) ?? []);
  candidateNorms.add(normalizeName(canonical.name));

  const userItems = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId));
  const existing = userItems.find((i) => candidateNorms.has(normalizeName(i.name)));

  let item;
  if (existing) {
    [item] = await db
      .update(itemsTable)
      .set({
        addedToListAt: now,
        dismissedAt: null,
        icon: existing.icon ?? canonical.icon ?? null,
        category: existing.category ?? canonical.category ?? null,
        globalPrice,
        globalStoreName,
      })
      .where(eq(itemsTable.id, existing.id))
      .returning();
  } else {
    [item] = await db
      .insert(itemsTable)
      .values({
        userId,
        name: canonical.name,
        icon: canonical.icon ?? null,
        category: canonical.category ?? null,
        addedToListAt: now,
        globalPrice,
        globalStoreName,
      })
      .returning();
  }

  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

export default router;
