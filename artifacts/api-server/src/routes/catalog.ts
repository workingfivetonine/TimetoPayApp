import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  itemsTable,
  usersTable,
  catalogItemAliasesTable,
  lineItemsTable,
  receiptsTable,
} from "@workspace/db";
import { isStateScoped } from "@workspace/geo";
import { AddCatalogItemToListBody } from "@workspace/api-zod";
import {
  ensureCatalog,
  computeGlobalPrices,
  normalizeName,
} from "../lib/catalog";
import { categoryOrder } from "../lib/categories";
import { requirePremium } from "../middlewares/requireEntitlement";

const router = Router();

// Load the requester's region for scoping the catalog. Returns null country when
// the user hasn't picked a region yet (in which case the region-scoped view is
// empty — they must set a region first, which the client gates on). State is
// only meaningful for the US.
async function userRegion(
  userId: string,
): Promise<{ countryCode: string | null; stateCode: string | null }> {
  const [u] = await db
    .select({ countryCode: usersTable.countryCode, stateCode: usersTable.stateCode })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const countryCode = u?.countryCode ?? null;
  const stateCode = countryCode && isStateScoped(countryCode) ? u?.stateCode ?? null : null;
  return { countryCode, stateCode };
}

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
router.get("/browse", requirePremium, async (req, res): Promise<void> => {
  const userId = req.userId!;
  await ensureCatalog();
  const region = await userRegion(userId);
  // A region is required to see any cross-user catalog data. Without one we
  // cannot scope by country/state, so returning unfiltered (global) results
  // would leak out-of-region activity. The client gates on this, but enforce it
  // server-side too: a region-less requester sees an empty catalog.
  if (!region.countryCode) {
    res.json({ categories: [] });
    return;
  }
  // The cross-user catalog exposes only non-identifying aggregates (item name,
  // store name, price, month-coarsened date), region-scoped and with the
  // requester's OWN rows excluded so it never echoes their data back. The former
  // k-anonymity contributor threshold has been disabled by product decision, so
  // an item is shown regardless of how many other shoppers bought it.
  const global = await computeGlobalPrices({
    excludeUserId: userId,
    countryCode: region.countryCode,
    stateCode: region.stateCode,
  });

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

  // norm -> the user's item id, for items currently on the list (so the client
  // can remove/dismiss them). And the set of norms the user has real purchase
  // history for (used by the "In my history" filter).
  const inListItemIdByNorm = new Map<string, number>();
  const historyNorms = new Set<string>();
  for (const i of userItems) {
    const norm = normalizeName(i.name);
    const lastPurchased = lastPurchaseByItem.get(i.id) ?? null;
    if (lastPurchased != null) historyNorms.add(norm);
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
    inListItemIdByNorm.set(norm, i.id);
  }

  const normsByItem = await aliasNormsByItem();

  const items = global.map((g) => {
    const best = g.stores.length ? g.stores[0] : null;
    const norms = normsByItem.get(g.catalogItemId) ?? [];
    const matchNorm = norms.find((n) => inListItemIdByNorm.has(n)) ?? null;
    const inList = matchNorm != null;
    const inHistory = norms.some((n) => historyNorms.has(n));
    // Coarsen the date to year-month (YYYY-MM) to prevent exact-timestamp
    // inference from other users' purchase history. The full ISO date is
    // available in the admin view only.
    const coarsenDate = (iso: string | null): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    };
    return {
      catalogItemId: g.catalogItemId,
      name: g.name,
      icon: g.icon,
      category: g.category,
      bestPrice: best ? best.latestPrice : null,
      bestStoreName: best ? best.storeName : null,
      bestDate: best ? coarsenDate(best.latestDate) : null,
      inList,
      inHistory,
      userItemId: matchNorm != null ? inListItemIdByNorm.get(matchNorm)! : null,
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
router.post("/add-to-list", requirePremium, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = AddCatalogItemToListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureCatalog();
  const region = await userRegion(userId);
  // Region-less requester has no visible catalog (see /browse); 404 keeps this
  // indistinguishable from a suppressed/out-of-region id.
  if (!region.countryCode) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }

  // Resolve the target item ONLY through the user's region-scoped catalog view
  // (same scope as browse). This both snapshots a privacy-safe price and gates
  // the route to the caller's visible set: an out-of-region item returns 404
  // (indistinguishable from "doesn't exist"), so sequential id probing can't be
  // used to disclose cross-region activity.
  const global = await computeGlobalPrices({
    excludeUserId: userId,
    countryCode: region.countryCode,
    stateCode: region.stateCode,
  });
  const entry = global.find((g) => g.catalogItemId === parsed.data.catalogItemId);
  if (!entry) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }
  const best = entry.stores.length ? entry.stores[0] : null;
  const globalPrice = best ? String(best.latestPrice) : null;
  const globalStoreName = best ? best.storeName : null;

  const now = new Date();

  // Match the user's existing item against ANY normalized alias of this
  // canonical item (not just the canonical name), so we update/reuse rather
  // than creating a duplicate when the user already owns a spelling variant.
  const normsByItem = await aliasNormsByItem();
  const candidateNorms = new Set(normsByItem.get(entry.catalogItemId) ?? []);
  candidateNorms.add(normalizeName(entry.name));

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
        icon: existing.icon ?? entry.icon ?? null,
        category: existing.category ?? entry.category ?? null,
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
        name: entry.name,
        icon: entry.icon ?? null,
        category: entry.category ?? null,
        addedToListAt: now,
        globalPrice,
        globalStoreName,
      })
      .returning();
  }

  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

export default router;
