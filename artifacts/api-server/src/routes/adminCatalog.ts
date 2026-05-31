import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  itemsTable,
  storesTable,
  receiptsTable,
  lineItemsTable,
  catalogItemsTable,
  catalogItemAliasesTable,
  catalogStoresTable,
  catalogStoreAliasesTable,
} from "@workspace/db";
import {
  AdminMergeCatalogItemsBody,
  AdminMergeCatalogStoresBody,
  AdminUpdateCatalogItemParams,
  AdminUpdateCatalogItemBody,
  AdminUpdateCatalogStoreParams,
  AdminUpdateCatalogStoreBody,
  AdminSplitCatalogItemParams,
  AdminSplitCatalogItemBody,
  AdminSplitCatalogStoreParams,
  AdminSplitCatalogStoreBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import {
  ensureCatalog,
  looseKey,
  normItemNameSql,
  normStoreNameSql,
} from "../lib/catalog";

const router = Router();
router.use(requireAdmin);

type Member = { normalizedName: string; displayName: string; count: number };
type Entry = {
  id: number;
  canonicalName: string;
  icon: string | null;
  members: Member[];
  totalCount: number;
};
type Suggestion = { ids: number[]; names: string[]; reason: string };

function buildSuggestions(entries: Entry[]): Suggestion[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = looseKey(e.canonicalName);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  const suggestions: Suggestion[] = [];
  for (const g of groups.values()) {
    if (g.length > 1) {
      suggestions.push({
        ids: g.map((e) => e.id),
        names: g.map((e) => e.canonicalName),
        reason: "Names look like spelling variants of each other",
      });
    }
  }
  return suggestions;
}

// ---- Global prices --------------------------------------------------------

router.get("/global", async (_req, res): Promise<void> => {
  await ensureCatalog();

  // Every purchased line item routed to its canonical item + store, with the
  // price and purchase date. Reduced in JS to "latest" per group.
  const rows = await db
    .select({
      catalogItemId: catalogItemAliasesTable.catalogItemId,
      catalogStoreId: catalogStoreAliasesTable.catalogStoreId,
      price: lineItemsTable.price,
      purchasedAt: receiptsTable.purchasedAt,
      createdAt: receiptsTable.createdAt,
    })
    .from(lineItemsTable)
    .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId))
    .innerJoin(catalogItemAliasesTable, eq(catalogItemAliasesTable.normalizedName, normItemNameSql))
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .innerJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
    .innerJoin(catalogStoreAliasesTable, eq(catalogStoreAliasesTable.normalizedName, normStoreNameSql));

  const catItems = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon })
    .from(catalogItemsTable);
  const catStores = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable);
  const itemMap = new Map(catItems.map((c) => [c.id, c]));
  const storeMap = new Map(catStores.map((c) => [c.id, c.name]));

  // Sort newest first so the first row seen per group is the most recent.
  const sorted = rows
    .map((r) => ({
      catalogItemId: r.catalogItemId,
      catalogStoreId: r.catalogStoreId,
      price: Number(r.price),
      purchasedAt: r.purchasedAt,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => {
      const t = b.purchasedAt.getTime() - a.purchasedAt.getTime();
      if (t !== 0) return t;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  type StoreAgg = { catalogStoreId: number; storeName: string; latestPrice: number; latestDate: Date };
  type ItemAgg = {
    overallLatestPrice: number;
    overallLatestStoreId: number;
    overallLatestDate: Date;
    stores: Map<number, StoreAgg>;
  };
  const agg = new Map<number, ItemAgg>();

  for (const r of sorted) {
    let a = agg.get(r.catalogItemId);
    if (!a) {
      a = {
        overallLatestPrice: r.price,
        overallLatestStoreId: r.catalogStoreId,
        overallLatestDate: r.purchasedAt,
        stores: new Map(),
      };
      agg.set(r.catalogItemId, a);
    }
    if (!a.stores.has(r.catalogStoreId)) {
      a.stores.set(r.catalogStoreId, {
        catalogStoreId: r.catalogStoreId,
        storeName: storeMap.get(r.catalogStoreId) ?? "Unknown",
        latestPrice: r.price,
        latestDate: r.purchasedAt,
      });
    }
  }

  const result = Array.from(agg.entries())
    .map(([catalogItemId, a]) => {
      const item = itemMap.get(catalogItemId);
      return {
        catalogItemId,
        name: item?.name ?? "Unknown",
        icon: item?.icon ?? null,
        overallLatestPrice: a.overallLatestPrice,
        overallLatestStoreId: a.overallLatestStoreId,
        overallLatestStoreName: storeMap.get(a.overallLatestStoreId) ?? "Unknown",
        overallLatestDate: a.overallLatestDate.toISOString(),
        stores: Array.from(a.stores.values())
          .sort((x, y) => x.latestPrice - y.latestPrice)
          .map((s) => ({
            catalogStoreId: s.catalogStoreId,
            storeName: s.storeName,
            latestPrice: s.latestPrice,
            latestDate: s.latestDate.toISOString(),
          })),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));

  res.json(result);
});

// ---- Catalog listings (items & stores) ------------------------------------

router.get("/items", async (_req, res): Promise<void> => {
  await ensureCatalog();

  const catItems = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon })
    .from(catalogItemsTable);

  const aliases = await db
    .select({
      normalizedName: catalogItemAliasesTable.normalizedName,
      displayName: catalogItemAliasesTable.displayName,
      catalogItemId: catalogItemAliasesTable.catalogItemId,
    })
    .from(catalogItemAliasesTable);

  // Count of user items per normalized name.
  const counts = await db
    .select({ norm: sql<string>`lower(btrim(${itemsTable.name}))`, count: sql<number>`count(*)::int` })
    .from(itemsTable)
    .groupBy(sql`lower(btrim(${itemsTable.name}))`);
  const countMap = new Map(counts.map((c) => [c.norm, c.count]));

  const membersByEntry = new Map<number, Member[]>();
  for (const a of aliases) {
    const m: Member = {
      normalizedName: a.normalizedName,
      displayName: a.displayName,
      count: countMap.get(a.normalizedName) ?? 0,
    };
    const list = membersByEntry.get(a.catalogItemId);
    if (list) list.push(m);
    else membersByEntry.set(a.catalogItemId, [m]);
  }

  const entries: Entry[] = catItems
    .map((c) => {
      const members = (membersByEntry.get(c.id) ?? []).sort((x, y) =>
        x.displayName.localeCompare(y.displayName),
      );
      return {
        id: c.id,
        canonicalName: c.name,
        icon: c.icon ?? null,
        members,
        totalCount: members.reduce((sum, m) => sum + m.count, 0),
      };
    })
    .sort((x, y) => x.canonicalName.localeCompare(y.canonicalName));

  res.json({ entries, suggestions: buildSuggestions(entries) });
});

router.get("/stores", async (_req, res): Promise<void> => {
  await ensureCatalog();

  const catStores = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable);

  const aliases = await db
    .select({
      normalizedName: catalogStoreAliasesTable.normalizedName,
      displayName: catalogStoreAliasesTable.displayName,
      catalogStoreId: catalogStoreAliasesTable.catalogStoreId,
    })
    .from(catalogStoreAliasesTable);

  const counts = await db
    .select({ norm: sql<string>`lower(btrim(${storesTable.name}))`, count: sql<number>`count(*)::int` })
    .from(storesTable)
    .groupBy(sql`lower(btrim(${storesTable.name}))`);
  const countMap = new Map(counts.map((c) => [c.norm, c.count]));

  const membersByEntry = new Map<number, Member[]>();
  for (const a of aliases) {
    const m: Member = {
      normalizedName: a.normalizedName,
      displayName: a.displayName,
      count: countMap.get(a.normalizedName) ?? 0,
    };
    const list = membersByEntry.get(a.catalogStoreId);
    if (list) list.push(m);
    else membersByEntry.set(a.catalogStoreId, [m]);
  }

  const entries: Entry[] = catStores
    .map((c) => {
      const members = (membersByEntry.get(c.id) ?? []).sort((x, y) =>
        x.displayName.localeCompare(y.displayName),
      );
      return {
        id: c.id,
        canonicalName: c.name,
        icon: null,
        members,
        totalCount: members.reduce((sum, m) => sum + m.count, 0),
      };
    })
    .sort((x, y) => x.canonicalName.localeCompare(y.canonicalName));

  res.json({ entries, suggestions: buildSuggestions(entries) });
});

// ---- Helpers to (re)build a single entry response -------------------------

async function buildItemEntry(id: number): Promise<Entry | null> {
  const [c] = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon })
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.id, id));
  if (!c) return null;
  const aliases = await db
    .select({ normalizedName: catalogItemAliasesTable.normalizedName, displayName: catalogItemAliasesTable.displayName })
    .from(catalogItemAliasesTable)
    .where(eq(catalogItemAliasesTable.catalogItemId, id));
  const members: Member[] = aliases.map((a) => ({
    normalizedName: a.normalizedName,
    displayName: a.displayName,
    count: 0,
  }));
  return { id: c.id, canonicalName: c.name, icon: c.icon ?? null, members, totalCount: 0 };
}

async function buildStoreEntry(id: number): Promise<Entry | null> {
  const [c] = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable)
    .where(eq(catalogStoresTable.id, id));
  if (!c) return null;
  const aliases = await db
    .select({ normalizedName: catalogStoreAliasesTable.normalizedName, displayName: catalogStoreAliasesTable.displayName })
    .from(catalogStoreAliasesTable)
    .where(eq(catalogStoreAliasesTable.catalogStoreId, id));
  const members: Member[] = aliases.map((a) => ({
    normalizedName: a.normalizedName,
    displayName: a.displayName,
    count: 0,
  }));
  return { id: c.id, canonicalName: c.name, icon: null, members, totalCount: 0 };
}

// ---- Merge ----------------------------------------------------------------

router.post("/items/merge", async (req, res): Promise<void> => {
  const parsed = AdminMergeCatalogItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) {
    res.status(400).json({ error: "Cannot merge an entry into itself" });
    return;
  }
  const [target] = await db.select().from(catalogItemsTable).where(eq(catalogItemsTable.id, targetId));
  const [source] = await db.select().from(catalogItemsTable).where(eq(catalogItemsTable.id, sourceId));
  if (!target || !source) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(catalogItemAliasesTable)
      .set({ catalogItemId: targetId })
      .where(eq(catalogItemAliasesTable.catalogItemId, sourceId));
    await tx.delete(catalogItemsTable).where(eq(catalogItemsTable.id, sourceId));
  });
  res.json(await buildItemEntry(targetId));
});

router.post("/stores/merge", async (req, res): Promise<void> => {
  const parsed = AdminMergeCatalogStoresBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) {
    res.status(400).json({ error: "Cannot merge an entry into itself" });
    return;
  }
  const [target] = await db.select().from(catalogStoresTable).where(eq(catalogStoresTable.id, targetId));
  const [source] = await db.select().from(catalogStoresTable).where(eq(catalogStoresTable.id, sourceId));
  if (!target || !source) {
    res.status(404).json({ error: "Catalog store not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(catalogStoreAliasesTable)
      .set({ catalogStoreId: targetId })
      .where(eq(catalogStoreAliasesTable.catalogStoreId, sourceId));
    await tx.delete(catalogStoresTable).where(eq(catalogStoresTable.id, sourceId));
  });
  res.json(await buildStoreEntry(targetId));
});

// ---- Rename ---------------------------------------------------------------

router.patch("/items/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateCatalogItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminUpdateCatalogItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: { canonicalName?: string; icon?: string | null } = {};
  if (parsed.data.canonicalName !== undefined) update.canonicalName = parsed.data.canonicalName;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [updated] = await db
    .update(catalogItemsTable)
    .set(update)
    .where(eq(catalogItemsTable.id, id))
    .returning({ id: catalogItemsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }
  res.json(await buildItemEntry(id));
});

router.patch("/stores/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateCatalogStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminUpdateCatalogStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(catalogStoresTable)
    .set({ canonicalName: parsed.data.canonicalName })
    .where(eq(catalogStoresTable.id, id))
    .returning({ id: catalogStoresTable.id });
  if (!updated) {
    res.status(404).json({ error: "Catalog store not found" });
    return;
  }
  res.json(await buildStoreEntry(id));
});

// ---- Split (move one member name into its own canonical entry) -------------

router.post("/items/:id/split", async (req, res): Promise<void> => {
  const params = AdminSplitCatalogItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminSplitCatalogItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [alias] = await db
    .select()
    .from(catalogItemAliasesTable)
    .where(eq(catalogItemAliasesTable.normalizedName, parsed.data.normalizedName));
  if (!alias || alias.catalogItemId !== id) {
    res.status(404).json({ error: "Member not found in this catalog item" });
    return;
  }
  const siblings = await db
    .select({ id: catalogItemAliasesTable.id })
    .from(catalogItemAliasesTable)
    .where(eq(catalogItemAliasesTable.catalogItemId, id));
  if (siblings.length <= 1) {
    res.status(400).json({ error: "Cannot split the only name out of an entry" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(catalogItemsTable)
      .values({ canonicalName: alias.displayName })
      .returning({ id: catalogItemsTable.id });
    await tx
      .update(catalogItemAliasesTable)
      .set({ catalogItemId: row.id })
      .where(eq(catalogItemAliasesTable.id, alias.id));
    return row;
  });
  res.json(await buildItemEntry(created.id));
});

router.post("/stores/:id/split", async (req, res): Promise<void> => {
  const params = AdminSplitCatalogStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminSplitCatalogStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [alias] = await db
    .select()
    .from(catalogStoreAliasesTable)
    .where(eq(catalogStoreAliasesTable.normalizedName, parsed.data.normalizedName));
  if (!alias || alias.catalogStoreId !== id) {
    res.status(404).json({ error: "Member not found in this catalog store" });
    return;
  }
  const siblings = await db
    .select({ id: catalogStoreAliasesTable.id })
    .from(catalogStoreAliasesTable)
    .where(eq(catalogStoreAliasesTable.catalogStoreId, id));
  if (siblings.length <= 1) {
    res.status(400).json({ error: "Cannot split the only name out of an entry" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(catalogStoresTable)
      .values({ canonicalName: alias.displayName })
      .returning({ id: catalogStoresTable.id });
    await tx
      .update(catalogStoreAliasesTable)
      .set({ catalogStoreId: row.id })
      .where(eq(catalogStoreAliasesTable.id, alias.id));
    return row;
  });
  res.json(await buildStoreEntry(created.id));
});

export default router;
