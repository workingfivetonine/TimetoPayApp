import { and, eq, gte, ne, sql, SQL } from "drizzle-orm";
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
import { isRealPrice } from "./prices";

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
  countryCode: string | null;
};
export type GlobalItem = {
  catalogItemId: number;
  name: string;
  icon: string | null;
  category: string | null;
  overallLatestPrice: number;
  overallLatestStoreId: number;
  overallLatestStoreName: string;
  overallLatestStoreCountry: string | null;
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

  // Push region/own-user filtering into SQL rather than loading every row for
  // every store worldwide and discarding most of them in JS — this query now
  // backs a per-request, region-scoped endpoint for every user, not just the
  // occasional admin view.
  const globalPricesConditions: SQL[] = [];
  if (filterCountry) {
    globalPricesConditions.push(eq(storesTable.countryCode, filterCountry));
    if (filterState) globalPricesConditions.push(eq(storesTable.stateCode, filterState));
  }
  if (excludeUserId) globalPricesConditions.push(ne(receiptsTable.userId, excludeUserId));

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
    .innerJoin(catalogStoreAliasesTable, eq(catalogStoreAliasesTable.normalizedName, normStoreNameSql))
    .where(globalPricesConditions.length > 0 ? and(...globalPricesConditions) : undefined);

  const catItems = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
    .from(catalogItemsTable);
  const catStores = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable);
  const itemMap = new Map(catItems.map((c) => [c.id, c]));
  const storeMap = new Map(catStores.map((c) => [c.id, c.name]));

  const sorted = rows
    // A line item can legitimately carry no price — "Log Items" saves a blank
    // price as 0.00, and receipt parsing can come back without one. Those are
    // real purchases but not prices, and the catalog exists ONLY to say what
    // others paid, so an unpriced row has nothing to contribute. Dropping them
    // here rather than at the end matters: rows are sorted most-recent-first and
    // the first row per store wins, so a single recent unpriced scan would
    // otherwise overwrite a real price with $0.00 for everyone in the region.
    // See lib/prices.ts — same rule the shopping list and analytics already use.
    // Region and own-user exclusion are applied above in the SQL `.where()`.
    .filter((r) => isRealPrice(r.price))
    .map((r) => ({
      catalogItemId: r.catalogItemId,
      catalogStoreId: r.catalogStoreId,
      price: Number(r.price),
      purchasedAt: r.purchasedAt,
      createdAt: r.createdAt,
      userId: r.userId,
      storeCountryCode: r.storeCountryCode,
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
    countryCode: string | null;
    users: Set<string>;
  };
  type ItemAgg = { stores: Map<number, StoreAgg> };
  const agg = new Map<number, ItemAgg>();

  for (const r of sorted) {
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
        countryCode: r.storeCountryCode ?? null,
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
        overallLatestStoreCountry: overall.countryCode,
        overallLatestDate: overall.latestDate.toISOString(),
        stores: stores.map((s) => ({
          catalogStoreId: s.catalogStoreId,
          storeName: s.storeName,
          latestPrice: s.latestPrice,
          latestDate: s.latestDate.toISOString(),
          countryCode: s.countryCode,
        })),
      };
    })
    .filter((x): x is GlobalItem => x !== null)
    .sort((x, y) => x.name.localeCompare(y.name));
}

// ---- Price growth over time (admin) ---------------------------------------

export type PriceGrowthPoint = { date: string; price: number };

export type PriceGrowthStore = {
  catalogStoreId: number;
  storeName: string;
  countryCode: string | null;
  firstPrice: number;
  lastPrice: number;
  // Null when the store has only one dated point — a single observation has no
  // growth, and reporting 0% would read as "held steady".
  growthPct: number | null;
  points: PriceGrowthPoint[];
};

export type PriceGrowthItem = {
  catalogItemId: number;
  name: string;
  icon: string | null;
  category: string | null;
  firstDate: string;
  lastDate: string;
  spanDays: number;
  purchaseCount: number;
  firstPrice: number;
  lastPrice: number;
  growthPct: number;
  stores: PriceGrowthStore[];
};

export type PriceGrowthResult = {
  // The window every item in this result was measured over. Charts share it as
  // their x-domain so two items are directly comparable side by side.
  // 0 means all time, in which case windowStart is the earliest price on record
  // across the returned items rather than a fixed offset from today.
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  items: PriceGrowthItem[];
};

// An item needs a history longer than this before a trend means anything —
// two points a day apart describe noise, not a price trajectory.
export const PRICE_GROWTH_MIN_SPAN_DAYS = 14;

// Selectable reporting windows, in days. Growth is measured from the first to
// the last observation INSIDE the window, so "90 days" means what it says
// rather than "since we first saw this item".
//
// 0 is the all-time window: no lower bound, so growth runs from each item's
// very first recorded price.
export const PRICE_GROWTH_ALL_TIME = 0;
export const PRICE_GROWTH_WINDOWS = [PRICE_GROWTH_ALL_TIME, 90, 182, 365] as const;
export const PRICE_GROWTH_DEFAULT_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

// Price trajectory per canonical item, split by store. Unlike
// computeGlobalPrices (which keeps only the most recent price per store) this
// keeps the whole series so it can be charted.
//
// Unsuppressed (no opts) is the admin view: full cross-user visibility,
// including exact dates. A user-facing caller MUST pass countryCode (region
// scoping — a region-less caller sees nothing), excludeUserId (their own
// purchases never drive what they're shown), and monthly:true (coarsens every
// date to YYYY-MM, matching computeGlobalPrices's own date coarsening — this
// view would otherwise be the one place in the app that hands back another
// shopper's exact purchase day).
export async function computePriceGrowth(
  opts: {
    minSpanDays?: number;
    windowDays?: number;
    countryCode?: string | null;
    stateCode?: string | null;
    excludeUserId?: string | null;
    monthly?: boolean;
  } = {},
): Promise<PriceGrowthResult> {
  const monthly = opts.monthly ?? false;
  const minSpanDays = opts.minSpanDays ?? PRICE_GROWTH_MIN_SPAN_DAYS;
  const windowDays = opts.windowDays ?? PRICE_GROWTH_DEFAULT_WINDOW_DAYS;
  const filterCountry = opts.countryCode ?? null;
  const filterState = opts.stateCode ?? null;
  const excludeUserId = opts.excludeUserId ?? null;
  // A day key (YYYY-MM-DD) coarsens to a month key (YYYY-MM) by taking its
  // first 7 characters — both are used purely as strings (bucket identity and
  // lexicographic ordering), so the same slice works on either.
  const keyLen = monthly ? 7 : 10;

  // Whole-day (or whole-month) bounds so every chart in a response shares an
  // identical x-domain regardless of the hour the request landed.
  const allTime = windowDays === PRICE_GROWTH_ALL_TIME;
  const todayMs = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const windowEnd = new Date(todayMs).toISOString().slice(0, keyLen);
  // For all-time there is no lower bound to filter on; the real start is the
  // earliest surviving observation, which is only known after aggregating.
  const windowStart = allTime
    ? null
    : new Date(todayMs - windowDays * DAY_MS).toISOString().slice(0, keyLen);
  // Same string, parsed back to a real Date, so the lower bound can be pushed
  // into SQL — anchoring a month key to its 1st, exactly matching the
  // string-coarsened `day >= windowStart` comparison this replaces.
  const windowStartDate =
    windowStart === null ? null : new Date(`${monthly ? `${windowStart}-01` : windowStart}T00:00:00Z`);

  // Push region/date/own-user filtering into SQL rather than loading every
  // row for every item and store worldwide and discarding most of them in JS
  // — this now backs a per-request, region-scoped endpoint for every user.
  const priceGrowthConditions: SQL[] = [];
  if (windowStartDate !== null) priceGrowthConditions.push(gte(receiptsTable.purchasedAt, windowStartDate));
  if (filterCountry) {
    priceGrowthConditions.push(eq(storesTable.countryCode, filterCountry));
    if (filterState) priceGrowthConditions.push(eq(storesTable.stateCode, filterState));
  }
  if (excludeUserId) priceGrowthConditions.push(ne(receiptsTable.userId, excludeUserId));

  const rows = await db
    .select({
      catalogItemId: catalogItemAliasesTable.catalogItemId,
      catalogStoreId: catalogStoreAliasesTable.catalogStoreId,
      price: lineItemsTable.price,
      purchasedAt: receiptsTable.purchasedAt,
      storeCountryCode: storesTable.countryCode,
      storeStateCode: storesTable.stateCode,
      userId: receiptsTable.userId,
    })
    .from(lineItemsTable)
    .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId))
    .innerJoin(catalogItemAliasesTable, eq(catalogItemAliasesTable.normalizedName, normItemNameSql))
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .innerJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
    .innerJoin(catalogStoreAliasesTable, eq(catalogStoreAliasesTable.normalizedName, normStoreNameSql))
    .where(priceGrowthConditions.length > 0 ? and(...priceGrowthConditions) : undefined);

  const catItems = await db
    .select({
      id: catalogItemsTable.id,
      name: catalogItemsTable.canonicalName,
      icon: catalogItemsTable.icon,
      category: catalogItemsTable.category,
    })
    .from(catalogItemsTable);
  const catStores = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable);
  const itemMap = new Map(catItems.map((c) => [c.id, c]));
  const storeMap = new Map(catStores.map((c) => [c.id, c.name]));

  // Unpriced rows are excluded for the same reason as everywhere else: a line
  // item saved without a price is a purchase, not a price, and charting it as
  // zero would invent a crash and recovery that never happened. See lib/prices.ts.
  type Bucket = { sum: number; n: number };
  const byItem = new Map<
    number,
    Map<number, { countryCode: string | null; days: Map<string, Bucket> }>
  >();

  for (const r of rows) {
    if (!isRealPrice(r.price)) continue;
    // Region, own-user, and the window's lower bound are all applied above in
    // the SQL `.where()`. Only the upper bound is left to check here — it
    // applies even for all-time, so a receipt mis-dated into the future
    // doesn't stretch every chart's axis to meet it.
    const price = Number(r.price);
    const day = r.purchasedAt.toISOString().slice(0, keyLen);
    if (day > windowEnd) continue;

    let stores = byItem.get(r.catalogItemId);
    if (!stores) {
      stores = new Map();
      byItem.set(r.catalogItemId, stores);
    }
    let store = stores.get(r.catalogStoreId);
    if (!store) {
      store = { countryCode: r.storeCountryCode ?? null, days: new Map() };
      stores.set(r.catalogStoreId, store);
    }
    // Several purchases of the same item at the same store on one day average
    // into a single point, so a big shop doesn't stack duplicate x-positions.
    const bucket = store.days.get(day);
    if (bucket) {
      bucket.sum += price;
      bucket.n += 1;
    } else {
      store.days.set(day, { sum: price, n: 1 });
    }
  }

  const out: PriceGrowthItem[] = [];

  for (const [catalogItemId, storeMapForItem] of byItem) {
    const item = itemMap.get(catalogItemId);
    if (!item) continue;

    const stores: PriceGrowthStore[] = [];
    let purchaseCount = 0;
    let earliest: string | null = null;
    let latest: string | null = null;

    for (const [catalogStoreId, agg] of storeMapForItem) {
      const points = Array.from(agg.days.entries())
        .map(([date, b]) => ({ date, price: Math.round((b.sum / b.n) * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (points.length === 0) continue;

      for (const b of agg.days.values()) purchaseCount += b.n;

      const first = points[0]!;
      const last = points[points.length - 1]!;
      if (earliest === null || first.date < earliest) earliest = first.date;
      if (latest === null || last.date > latest) latest = last.date;

      stores.push({
        catalogStoreId,
        storeName: storeMap.get(catalogStoreId) ?? "Unknown",
        countryCode: agg.countryCode,
        firstPrice: first.price,
        lastPrice: last.price,
        growthPct:
          points.length > 1 && first.price > 0
            ? Math.round(((last.price - first.price) / first.price) * 1000) / 10
            : null,
        points,
      });
    }

    if (!earliest || !latest || stores.length === 0) continue;

    // A month key (YYYY-MM) has no day component to parse — anchor it to the
    // 1st explicitly rather than relying on a lenient Date parser to guess it.
    const toParsableDate = (key: string) => (monthly ? `${key}-01` : key);
    const spanDays = Math.round(
      (new Date(`${toParsableDate(latest)}T00:00:00Z`).getTime() -
        new Date(`${toParsableDate(earliest)}T00:00:00Z`).getTime()) /
        DAY_MS,
    );
    if (spanDays < minSpanDays) continue;

    // Item-level growth compares the earliest and latest observation across ALL
    // stores, so it answers "what is this costing now vs then" rather than
    // tracking any one retailer.
    const allPoints = stores
      .flatMap((s) => s.points)
      .sort((a, b) => a.date.localeCompare(b.date));
    const firstPrice = allPoints[0]!.price;
    const lastPrice = allPoints[allPoints.length - 1]!.price;

    stores.sort((a, b) => a.storeName.localeCompare(b.storeName));

    out.push({
      catalogItemId,
      name: item.name,
      icon: item.icon ?? null,
      category: item.category ?? null,
      firstDate: earliest,
      lastDate: latest,
      spanDays,
      purchaseCount,
      firstPrice,
      lastPrice,
      growthPct:
        firstPrice > 0
          ? Math.round(((lastPrice - firstPrice) / firstPrice) * 1000) / 10
          : 0,
      stores,
    });
  }

  // Steepest rise first — the point of the view is to surface what is climbing.
  out.sort((a, b) => b.growthPct - a.growthPct);

  // All-time spans from the oldest price on record across everything returned,
  // so the charts still share one domain — an item first bought recently simply
  // occupies the right-hand slice of it, which is itself informative. Falls back
  // to windowEnd when nothing survived, keeping the range valid rather than null.
  const effectiveStart =
    windowStart ??
    out.reduce<string | null>(
      (min, it) => (min === null || it.firstDate < min ? it.firstDate : min),
      null,
    ) ??
    windowEnd;

  return { windowDays, windowStart: effectiveStart, windowEnd, items: out };
}
