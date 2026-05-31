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
    .select({ name: itemsTable.name, icon: itemsTable.icon })
    .from(itemsTable);

  const distinct = new Map<string, { display: string; icon: string | null }>();
  for (const r of rows) {
    const norm = normalizeName(r.name);
    if (!norm) continue;
    if (!distinct.has(norm)) distinct.set(norm, { display: r.name, icon: r.icon ?? null });
  }

  const existing = await db
    .select({ normalizedName: catalogItemAliasesTable.normalizedName })
    .from(catalogItemAliasesTable);
  const have = new Set(existing.map((e) => e.normalizedName));

  for (const [norm, info] of distinct) {
    if (have.has(norm)) continue;
    const [canonical] = await db
      .insert(catalogItemsTable)
      .values({ canonicalName: info.display, icon: info.icon })
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
