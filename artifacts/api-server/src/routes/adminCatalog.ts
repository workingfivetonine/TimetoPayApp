import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  itemsTable,
  storesTable,
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
  computeGlobalPrices,
} from "../lib/catalog";
import { isValidCategory } from "../lib/categories";

const router = Router();
router.use(requireAdmin);

type Member = { normalizedName: string; displayName: string; count: number };
type Entry = {
  id: number;
  canonicalName: string;
  icon: string | null;
  category: string | null;
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
  res.json(await computeGlobalPrices());
});

// ---- Catalog listings (items & stores) ------------------------------------

router.get("/items", async (_req, res): Promise<void> => {
  await ensureCatalog();

  const catItems = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
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
        category: c.category ?? null,
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
        category: null,
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
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
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
  return { id: c.id, canonicalName: c.name, icon: c.icon ?? null, category: c.category ?? null, members, totalCount: 0 };
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
  return { id: c.id, canonicalName: c.name, icon: null, category: null, members, totalCount: 0 };
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
  const update: { canonicalName?: string; icon?: string | null; category?: string | null } = {};
  if (parsed.data.canonicalName !== undefined) update.canonicalName = parsed.data.canonicalName;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.category !== undefined) {
    if (parsed.data.category !== null && !isValidCategory(parsed.data.category)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    update.category = parsed.data.category;
  }
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
