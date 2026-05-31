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

// Normalization must stay in lockstep with the SQL form `lower(btrim(name))`
// used when joining line items back onto canonical entries.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Loose key for surfacing likely spelling variants (ignores case, spaces,
// and punctuation). Used only to *suggest* merges, never to auto-merge.
export function looseKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function ensureItems(): Promise<void> {
  const rows = await db
    .select({ name: itemsTable.name, icon: itemsTable.icon, category: itemsTable.category })
    .from(itemsTable);

  const distinct = new Map<string, { display: string; icon: string | null; category: string | null }>();
  // normalizedName -> category, used to backfill canonical entries created
  // before categories existed.
  const categoryByNorm = new Map<string, string>();
  for (const r of rows) {
    const norm = normalizeName(r.name);
    if (!norm) continue;
    if (r.category && !categoryByNorm.has(norm)) categoryByNorm.set(norm, r.category);
    if (!distinct.has(norm)) distinct.set(norm, { display: r.name, icon: r.icon ?? null, category: r.category ?? null });
  }

  const existing = await db
    .select({ normalizedName: catalogItemAliasesTable.normalizedName })
    .from(catalogItemAliasesTable);
  const have = new Set(existing.map((e) => e.normalizedName));

  for (const [norm, info] of distinct) {
    if (have.has(norm)) continue;
    const [canonical] = await db
      .insert(catalogItemsTable)
      .values({ canonicalName: info.display, icon: info.icon, category: info.category })
      .returning({ id: catalogItemsTable.id });
    const inserted = await db
      .insert(catalogItemAliasesTable)
      .values({ normalizedName: norm, displayName: info.display, catalogItemId: canonical.id })
      .onConflictDoNothing()
      .returning({ id: catalogItemAliasesTable.id });
    if (inserted.length === 0) {
      await db.delete(catalogItemsTable).where(eq(catalogItemsTable.id, canonical.id));
    }
  }

  // Backfill categories for canonical items that have none, using the category
  // from any of their member aliases' user items.
  const uncategorized = await db
    .select({ id: catalogItemsTable.id })
    .from(catalogItemsTable)
    .where(sql`${catalogItemsTable.category} is null`);
  if (uncategorized.length > 0) {
    const aliasRows = await db
      .select({ normalizedName: catalogItemAliasesTable.normalizedName, catalogItemId: catalogItemAliasesTable.catalogItemId })
      .from(catalogItemAliasesTable);
    const aliasesByItem = new Map<number, string[]>();
    for (const a of aliasRows) {
      const list = aliasesByItem.get(a.catalogItemId);
      if (list) list.push(a.normalizedName);
      else aliasesByItem.set(a.catalogItemId, [a.normalizedName]);
    }
    for (const { id } of uncategorized) {
      const norms = aliasesByItem.get(id) ?? [];
      let category: string | undefined;
      for (const n of norms) {
        const c = categoryByNorm.get(n);
        if (c) { category = c; break; }
      }
      if (category) {
        await db.update(catalogItemsTable).set({ category }).where(eq(catalogItemsTable.id, id));
      }
    }
  }
}

async function ensureStores(): Promise<void> {
  const rows = await db.select({ name: storesTable.name }).from(storesTable);

  const distinct = new Map<string, { display: string }>();
  for (const r of rows) {
    const norm = normalizeName(r.name);
    if (!norm) continue;
    if (!distinct.has(norm)) distinct.set(norm, { display: r.name });
  }

  const existing = await db
    .select({ normalizedName: catalogStoreAliasesTable.normalizedName })
    .from(catalogStoreAliasesTable);
  const have = new Set(existing.map((e) => e.normalizedName));

  for (const [norm, info] of distinct) {
    if (have.has(norm)) continue;
    const [canonical] = await db
      .insert(catalogStoresTable)
      .values({ canonicalName: info.display })
      .returning({ id: catalogStoresTable.id });
    const inserted = await db
      .insert(catalogStoreAliasesTable)
      .values({ normalizedName: norm, displayName: info.display, catalogStoreId: canonical.id })
      .onConflictDoNothing()
      .returning({ id: catalogStoreAliasesTable.id });
    if (inserted.length === 0) {
      await db.delete(catalogStoresTable).where(eq(catalogStoresTable.id, canonical.id));
    }
  }
}

// Lazily make sure every distinct user store/item name has a canonical entry
// and alias. Safe to call on every admin catalog request; household-scale data.
export async function ensureCatalog(): Promise<void> {
  await ensureItems();
  await ensureStores();
}

// SQL fragments for joining user names onto alias rows by normalized name.
export const normItemNameSql = sql`lower(btrim(${itemsTable.name}))`;
export const normStoreNameSql = sql`lower(btrim(${storesTable.name}))`;

export type GlobalStorePrice = {
  catalogStoreId: number;
  storeName: string;
  latestPrice: number;
  latestDate: string;
};
export type GlobalItem = {
  catalogItemId: number;
  name: string;
  icon: string | null;
  category: string | null;
  overallLatestPrice: number;
  overallLatestStoreId: number;
  overallLatestStoreName: string;
  overallLatestDate: string;
  stores: GlobalStorePrice[];
};

// Aggregate the most-recent price per canonical item across ALL users, plus the
// most-recent price per store. Never exposes who bought what. Shared by the
// admin global view and the all-user browse endpoint. Caller should run
// `ensureCatalog()` first.
export async function computeGlobalPrices(): Promise<GlobalItem[]> {
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
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
    .from(catalogItemsTable);
  const catStores = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable);
  const itemMap = new Map(catItems.map((c) => [c.id, c]));
  const storeMap = new Map(catStores.map((c) => [c.id, c.name]));

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

  return Array.from(agg.entries())
    .map(([catalogItemId, a]) => {
      const item = itemMap.get(catalogItemId);
      return {
        catalogItemId,
        name: item?.name ?? "Unknown",
        icon: item?.icon ?? null,
        category: item?.category ?? null,
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
}
