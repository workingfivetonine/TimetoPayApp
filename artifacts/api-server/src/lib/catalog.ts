import { eq, sql } from "drizzle-orm";
import {
  db,
  itemsTable,
  storesTable,
  receiptsTable,
  lineItemsTable,
  usersTable,
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

// NOTE: the k-anonymity contributor threshold (formerly CATALOG_MIN_CONTRIBUTORS
// = 3) has been intentionally DISABLED by product decision. The cross-user
// catalog only ever exposes aggregate, non-identifying data (canonical item
// name, store name, a price, and a month-coarsened date, scoped to the viewer's
// region with the viewer's own rows excluded — never a user identity or a raw
// per-user row), so a single contributor is treated as non-sensitive. The
// generic `minDistinctUsers` suppression below remains available (and the
// tenure gate it relies on) should we ever want to re-enable a threshold, but
// no caller passes it anymore. See threat_model.md (Information Disclosure).

// Account-tenure gate for catalog CONTRIBUTORS, applied ONLY when a caller opts
// into suppression via `minDistinctUsers` > 1 (currently no caller does). When
// active, a user's purchases only count toward the threshold once
// their account is at least this many days old. Raw distinct-userId counting is
// trivially defeated by Sybil/sockpuppet accounts on a public self-service
// deployment: an attacker can create throwaway accounts + fabricated receipts to
// satisfy the contributor threshold *on demand* and confirm a target's purchase.
// Requiring tenure removes the "on demand" property (fresh accounts contribute
// price data like ownerless rows, but never unlock an entry), so an attacker can
// no longer manufacture qualifying contributors at probe time — they would have
// to pre-provision and age accounts, which is far costlier and not real-time.
// This does NOT make the catalog fully Sybil-proof (a patient attacker can still
// age sockpuppets); full resistance would need identity attestation, which is out
// of scope. Configurable via CATALOG_CONTRIBUTOR_MIN_AGE_DAYS; default 7. Set to
// 0 to disable the gate.
export const CATALOG_CONTRIBUTOR_MIN_AGE_DAYS = (() => {
  const raw = process.env.CATALOG_CONTRIBUTOR_MIN_AGE_DAYS;
  if (raw === undefined) return 7;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
})();

export type GlobalPricesOptions = {
  // k-anonymity threshold. When > 1, suppress any per-store price (and any item
  // then left with no surviving store) backed by fewer than this many DISTINCT
  // non-null user contributors. Omit (or <= 1) for the trusted admin view,
  // which sees the full cross-user catalog with no suppression.
  minDistinctUsers?: number;
  // When set, this user's own rows are dropped before counting/aggregating, so
  // the threshold counts only OTHER users and the catalog never just echoes the
  // requester's own purchases back to them.
  excludeUserId?: string | null;
  // Region scoping for the non-admin browse/add-to-list view. When set, only
  // stores in this country contribute (and are shown). When stateCode is also
  // set (US only), the store's state must match too. Omit both for the trusted
  // admin view, which sees every region.
  countryCode?: string | null;
  stateCode?: string | null;
};

// Aggregate the most-recent price per canonical item across users, plus the
// most-recent price per store. Never exposes who bought what. Shared by the
// admin global view (no options => full visibility) and the all-user browse
// endpoint (privacy-thresholded via `opts`). Caller should run `ensureCatalog()`
// first.
export async function computeGlobalPrices(
  opts: GlobalPricesOptions = {},
): Promise<GlobalItem[]> {
  const minDistinctUsers = opts.minDistinctUsers ?? 1;
  const excludeUserId = opts.excludeUserId ?? null;
  const suppress = minDistinctUsers > 1;
  // Region scoping (non-admin view only). When a country is set, a row's store
  // must match it; when a state is also set (US only), the store's state must
  // match too. Admin passes neither, so filterCountry stays null (no filtering).
  const filterCountry = opts.countryCode ?? null;
  const filterState = opts.stateCode ?? null;

  // Sybil-resistance: in the thresholded (non-admin) view, only accounts that
  // have existed for at least CATALOG_CONTRIBUTOR_MIN_AGE_DAYS may count toward
  // the k-anonymity threshold. Fresh accounts (the cheap, on-demand sockpuppets
  // an attacker spins up to probe a target) behave like ownerless rows: their
  // prices can still feed the aggregate, but they never unlock an entry. The
  // admin view (no suppression) is exempt — admin is trusted and sees everyone.
  let matureUserIds: Set<string> | null = null;
  if (suppress && CATALOG_CONTRIBUTOR_MIN_AGE_DAYS > 0) {
    const cutoff = new Date(
      Date.now() - CATALOG_CONTRIBUTOR_MIN_AGE_DAYS * 24 * 60 * 60 * 1000,
    );
    const matureRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`${usersTable.createdAt} <= ${cutoff}`);
    matureUserIds = new Set(matureRows.map((r) => r.id));
  }

  const rows = await db
    .select({
      catalogItemId: catalogItemAliasesTable.catalogItemId,
      catalogStoreId: catalogStoreAliasesTable.catalogStoreId,
      price: lineItemsTable.price,
      purchasedAt: receiptsTable.purchasedAt,
      createdAt: receiptsTable.createdAt,
      userId: receiptsTable.userId,
      storeCountryCode: storesTable.countryCode,
      storeStateCode: storesTable.stateCode,
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
    // Drop rows whose store is outside the requested region before aggregating,
    // so out-of-region prices never count toward the threshold or appear.
    .filter((r) => {
      if (!filterCountry) return true;
      if (r.storeCountryCode !== filterCountry) return false;
      if (filterState && r.storeStateCode !== filterState) return false;
      return true;
    })
    .map((r) => ({
      catalogItemId: r.catalogItemId,
      catalogStoreId: r.catalogStoreId,
      price: Number(r.price),
      purchasedAt: r.purchasedAt,
      createdAt: r.createdAt,
      userId: r.userId,
    }))
    .sort((a, b) => {
      const t = b.purchasedAt.getTime() - a.purchasedAt.getTime();
      if (t !== 0) return t;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  type StoreAgg = {
    catalogStoreId: number;
    storeName: string;
    latestPrice: number;
    latestDate: Date;
    latestCreatedAt: Date;
    users: Set<string>;
  };
  type ItemAgg = { stores: Map<number, StoreAgg> };
  const agg = new Map<number, ItemAgg>();

  for (const r of sorted) {
    // Privacy: never let the requester's own purchases drive (or unlock) the
    // catalog they see.
    if (excludeUserId && r.userId === excludeUserId) continue;
    let a = agg.get(r.catalogItemId);
    if (!a) {
      a = { stores: new Map() };
      agg.set(r.catalogItemId, a);
    }
    let s = a.stores.get(r.catalogStoreId);
    if (!s) {
      // First (most-recent) row for this store sets the displayed latest price.
      s = {
        catalogStoreId: r.catalogStoreId,
        storeName: storeMap.get(r.catalogStoreId) ?? "Unknown",
        latestPrice: r.price,
        latestDate: r.purchasedAt,
        latestCreatedAt: r.createdAt,
        users: new Set<string>(),
      };
      a.stores.set(r.catalogStoreId, s);
    }
    // Only NON-NULL owners count toward the k-anonymity threshold. Ownerless
    // (anonymized legacy) rows — AND, in the thresholded view, accounts too new
    // to have cleared the tenure gate — contribute price data but never unlock
    // an entry, so on-demand sockpuppets can't satisfy the threshold.
    if (r.userId && (!matureUserIds || matureUserIds.has(r.userId))) {
      s.users.add(r.userId);
    }
  }

  return Array.from(agg.entries())
    .map(([catalogItemId, a]): GlobalItem | null => {
      const item = itemMap.get(catalogItemId);
      const stores = Array.from(a.stores.values())
        .filter((s) => !suppress || s.users.size >= minDistinctUsers)
        .sort((x, y) => x.latestPrice - y.latestPrice);
      // Suppressed down to nothing => omit the item entirely (don't even leak
      // that it exists).
      if (stores.length === 0) return null;
      // Overall latest = the surviving store with the most recent purchase,
      // using the same (purchasedAt desc, then createdAt desc) ordering as the
      // global sort so the no-suppression (admin) result matches the
      // pre-thresholding "most recent row overall" behavior. The final
      // catalogStoreId tiebreak makes selection fully deterministic and
      // independent of the (price-based) `stores` ordering on exact timestamp
      // ties (the old path was DB-row-order dependent here).
      const overall = stores.reduce((acc, s) => {
        const t = s.latestDate.getTime() - acc.latestDate.getTime();
        if (t > 0) return s;
        if (t < 0) return acc;
        const c = s.latestCreatedAt.getTime() - acc.latestCreatedAt.getTime();
        if (c > 0) return s;
        if (c < 0) return acc;
        return s.catalogStoreId < acc.catalogStoreId ? s : acc;
      });
      return {
        catalogItemId,
        name: item?.name ?? "Unknown",
        icon: item?.icon ?? null,
        category: item?.category ?? null,
        overallLatestPrice: overall.latestPrice,
        overallLatestStoreId: overall.catalogStoreId,
        overallLatestStoreName: overall.storeName,
        overallLatestDate: overall.latestDate.toISOString(),
        stores: stores.map((s) => ({
          catalogStoreId: s.catalogStoreId,
          storeName: s.storeName,
          latestPrice: s.latestPrice,
          latestDate: s.latestDate.toISOString(),
        })),
      };
    })
    .filter((x): x is GlobalItem => x !== null)
    .sort((x, y) => x.name.localeCompare(y.name));
}
