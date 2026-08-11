// Admin "build your own chart" tool: a small, fully whitelisted query builder
// over a handful of tables. The client only ever sends KEYS (e.g. "purchasedAt",
// "storeName") that are looked up against the maps below — never a raw column
// name, table name, or SQL fragment. This is what keeps it safe to let an admin
// pick arbitrary combinations: there is no path from client input to a SQL
// string, because none of these functions build one.
//
// Deliberately in-memory aggregation, matching the style already used for
// computeGlobalPrices/computePriceGrowth: load the (bounded, personal-scale)
// row set once, group and aggregate in JS. Simpler and safer than composing a
// dynamic SQL GROUP BY from client-chosen fields, at the cost of not scaling to
// a multi-tenant-SaaS-sized table — fine for this app's shape.
import { eq } from "drizzle-orm";
import {
  db,
  receiptsTable,
  storesTable,
  itemsTable,
  lineItemsTable,
  usersTable,
} from "@workspace/db";
import { isRealPrice } from "./prices";

export type Granularity = "day" | "week" | "month" | "year";
export type Aggregation = "count" | "sum" | "avg" | "min" | "max";
export const GRANULARITIES: readonly Granularity[] = ["day", "week", "month", "year"];
export const AGGREGATIONS: readonly Aggregation[] = ["count", "sum", "avg", "min", "max"];

export interface ChartField {
  key: string;
  label: string;
  // Only meaningful on a measure field — tells the chart how to format the
  // axis/legend values without it having to guess from the label text.
  unit?: "currency" | "count";
}

export interface ChartSourceMeta {
  key: string;
  label: string;
  dateFields: ChartField[];
  categoryFields: ChartField[];
  measureFields: ChartField[];
}

// One row of already-extracted, already-typed data. `date` is null only for a
// row from a source with no date field at all (none currently), kept optional
// for that future case rather than as a real possibility today.
interface ChartRow {
  date: Date | null;
  cats: Record<string, string>;
  measures: Record<string, number | null>;
}

interface SourceDef {
  meta: ChartSourceMeta;
  load: () => Promise<ChartRow[]>;
}

async function loadReceiptsRows(): Promise<ChartRow[]> {
  const rows = await db
    .select({
      purchasedAt: receiptsTable.purchasedAt,
      storeName: storesTable.name,
      storeCountry: storesTable.countryCode,
      total: receiptsTable.total,
      tax: receiptsTable.tax,
      deliveryFee: receiptsTable.deliveryFee,
      discount: receiptsTable.discount,
    })
    .from(receiptsTable)
    .innerJoin(storesTable, eq(storesTable.id, receiptsTable.storeId));

  return rows.map((r) => ({
    date: r.purchasedAt,
    cats: { storeName: r.storeName, storeCountry: r.storeCountry ?? "Unknown" },
    measures: {
      total: r.total != null ? Number(r.total) : null,
      tax: r.tax != null ? Number(r.tax) : null,
      deliveryFee: r.deliveryFee != null ? Number(r.deliveryFee) : null,
      discount: r.discount != null ? Number(r.discount) : null,
    },
  }));
}

async function loadLineItemsRows(): Promise<ChartRow[]> {
  const rows = await db
    .select({
      purchasedAt: receiptsTable.purchasedAt,
      storeName: storesTable.name,
      category: itemsTable.category,
      itemName: itemsTable.name,
      price: lineItemsTable.price,
      quantity: lineItemsTable.quantity,
    })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .innerJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
    .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId));

  return rows.map((r) => {
    const price = Number(r.price);
    const quantity = Number(r.quantity);
    return {
      date: r.purchasedAt,
      cats: {
        storeName: r.storeName,
        category: r.category ?? "Uncategorized",
        itemName: r.itemName,
      },
      measures: {
        // Same rule as everywhere else in this app: a line saved without a real
        // price is a purchase, not a price, and must not contribute $0 to a
        // spend total. See lib/prices.ts.
        lineTotal: isRealPrice(price) ? Math.round(price * quantity * 100) / 100 : null,
        quantity: Number.isFinite(quantity) ? quantity : null,
      },
    };
  });
}

async function loadUsersRows(): Promise<ChartRow[]> {
  const rows = await db
    .select({
      createdAt: usersTable.createdAt,
      role: usersTable.role,
      countryCode: usersTable.countryCode,
    })
    .from(usersTable);

  return rows.map((r) => ({
    date: r.createdAt,
    cats: { role: r.role, countryCode: r.countryCode ?? "Unknown" },
    measures: {},
  }));
}

async function loadStoresRows(): Promise<ChartRow[]> {
  const rows = await db
    .select({
      createdAt: storesTable.createdAt,
      countryCode: storesTable.countryCode,
      deliveryFee: storesTable.deliveryFee,
      minimumOrderAmount: storesTable.minimumOrderAmount,
    })
    .from(storesTable);

  return rows.map((r) => ({
    date: r.createdAt,
    cats: { countryCode: r.countryCode ?? "Unknown" },
    measures: {
      deliveryFee: r.deliveryFee != null ? Number(r.deliveryFee) : null,
      minimumOrderAmount: r.minimumOrderAmount != null ? Number(r.minimumOrderAmount) : null,
    },
  }));
}

const SOURCES: Record<string, SourceDef> = {
  receipts: {
    meta: {
      key: "receipts",
      label: "Receipts",
      dateFields: [{ key: "purchasedAt", label: "Purchase date" }],
      categoryFields: [
        { key: "storeName", label: "Store" },
        { key: "storeCountry", label: "Country" },
      ],
      measureFields: [
        { key: "total", label: "Total", unit: "currency" },
        { key: "tax", label: "Tax", unit: "currency" },
        { key: "deliveryFee", label: "Delivery fee", unit: "currency" },
        { key: "discount", label: "Discount", unit: "currency" },
      ],
    },
    load: loadReceiptsRows,
  },
  lineItems: {
    meta: {
      key: "lineItems",
      label: "Items purchased",
      dateFields: [{ key: "purchasedAt", label: "Purchase date" }],
      categoryFields: [
        { key: "storeName", label: "Store" },
        { key: "category", label: "Category" },
        { key: "itemName", label: "Item" },
      ],
      measureFields: [
        { key: "lineTotal", label: "Amount spent", unit: "currency" },
        { key: "quantity", label: "Quantity", unit: "count" },
      ],
    },
    load: loadLineItemsRows,
  },
  users: {
    meta: {
      key: "users",
      label: "Users",
      dateFields: [{ key: "createdAt", label: "Signed up" }],
      categoryFields: [
        { key: "role", label: "Role" },
        { key: "countryCode", label: "Country" },
      ],
      measureFields: [],
    },
    load: loadUsersRows,
  },
  stores: {
    meta: {
      key: "stores",
      label: "Stores",
      dateFields: [{ key: "createdAt", label: "Added" }],
      categoryFields: [{ key: "countryCode", label: "Country" }],
      measureFields: [
        { key: "deliveryFee", label: "Delivery fee", unit: "currency" },
        { key: "minimumOrderAmount", label: "Minimum order", unit: "currency" },
      ],
    },
    load: loadStoresRows,
  },
};

export function listChartSources(): ChartSourceMeta[] {
  return Object.values(SOURCES).map((s) => s.meta);
}

// Series capped so a filter with hundreds of distinct values (e.g. splitting by
// item name) doesn't produce a chart with hundreds of lines/bars. The excess is
// folded into one "Other" entry rather than silently dropped — the count is
// reported back so the client can say what was folded in, per the same
// no-silent-caps rule as everywhere else charts get built in this app.
const MAX_SERIES = 8;
const MAX_CATEGORIES = 20;

export interface ChartSeriesPoint {
  bucket: string;
  value: number;
}
export interface ChartSeries {
  key: string;
  points: ChartSeriesPoint[];
}
export interface ChartResult {
  kind: "time" | "category";
  // How to display a value — resolved here rather than left for the client to
  // re-derive from the measure key, since the server already knows it.
  unit: "currency" | "count";
  series: ChartSeries[];
  // Distinct split values / categories folded into "Other" beyond the cap.
  otherCount: number;
  // Rows that actually fed the chart (after excluding ones missing the chosen
  // measure) — context for judging whether a chart is drawing on a handful of
  // rows or a real sample.
  rowCount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Monday-start ISO-ish week key, computed in UTC to avoid local-timezone drift
// shifting a purchase across a week boundary depending on the server's clock.
function bucketDate(d: Date, granularity: Granularity): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (granularity === "year") return String(y);
  if (granularity === "month") return `${y}-${String(m + 1).padStart(2, "0")}`;
  if (granularity === "week") {
    const monday = new Date(Date.UTC(y, m, day));
    const isoDow = (monday.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    monday.setUTCDate(monday.getUTCDate() - isoDow);
    return monday.toISOString().slice(0, 10);
  }
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The value one row contributes. Count contributes exactly 1 regardless of any
// measure, so "count" and "sum of a measure" can share the same aggregation
// code path (sum-of-ones = count). Returns null for a row that cannot
// contribute — missing the chosen measure — which excludes it from an
// average/min/max rather than counting it as a zero.
function valueFor(row: ChartRow, aggregation: Aggregation, measure?: string): number | null {
  if (aggregation === "count") return 1;
  if (!measure) return null;
  const v = row.measures[measure];
  return v == null || !Number.isFinite(v) ? null : v;
}

function aggregateValues(values: number[], aggregation: Aggregation): number {
  if (values.length === 0) return 0;
  if (aggregation === "count") return values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (aggregation === "sum") return round2(sum);
  if (aggregation === "avg") return round2(sum / values.length);
  if (aggregation === "min") return round2(Math.min(...values));
  return round2(Math.max(...values));
}

export interface ChartQueryInput {
  source: string;
  groupBy: string;
  granularity?: string;
  splitBy?: string;
  aggregation: string;
  measure?: string;
  // Restrict to rows where each named category field's value is ONE OF the
  // given list — an OR within a field, ANDed across different fields, applied
  // before grouping. ("Milk" or "Eggs") AND ("US" or "GB"). This is also how a
  // "currency" or "country" filter works: there's no separate currency column,
  // so pinning storeCountry/countryCode to a set of values is what makes
  // summing money meaningful (unfiltered, rows from incompatible currencies
  // otherwise silently get added together as if they were the same unit).
  filters?: Record<string, string[]>;
}

export async function computeCustomChart(
  input: ChartQueryInput,
): Promise<ChartResult | { error: string }> {
  const src = SOURCES[input.source];
  if (!src) return { error: `Unknown data source "${input.source}"` };
  const meta = src.meta;

  const isDateGroupBy = meta.dateFields.some((f) => f.key === input.groupBy);
  const isCatGroupBy = meta.categoryFields.some((f) => f.key === input.groupBy);
  if (!isDateGroupBy && !isCatGroupBy) {
    return { error: `"${input.groupBy}" is not a field on ${meta.label}` };
  }

  if (!(AGGREGATIONS as readonly string[]).includes(input.aggregation)) {
    return { error: `Unknown aggregation "${input.aggregation}"` };
  }
  const aggregation = input.aggregation as Aggregation;

  let measure: string | undefined;
  // Count has its own unit regardless of source — it's always a count of rows,
  // never money — so it's resolved before the measure lookup below.
  let unit: "currency" | "count" = "count";
  if (aggregation !== "count") {
    const field = meta.measureFields.find((f) => f.key === input.measure);
    if (!field) {
      return { error: `"${input.measure}" is not a number field on ${meta.label}` };
    }
    measure = field.key;
    unit = field.unit ?? "count";
  }

  let splitBy: string | undefined;
  if (input.splitBy) {
    if (!isDateGroupBy) {
      return { error: "Splitting into multiple lines only works when grouping by a date" };
    }
    if (!meta.categoryFields.some((f) => f.key === input.splitBy)) {
      return { error: `"${input.splitBy}" is not a field on ${meta.label}` };
    }
    splitBy = input.splitBy;
  }

  const filters: Record<string, string[]> = {};
  for (const [field, values] of Object.entries(input.filters ?? {})) {
    if (!meta.categoryFields.some((f) => f.key === field)) {
      return { error: `"${field}" is not a field on ${meta.label}` };
    }
    // An empty (or, after stripping non-strings, empty) value list is treated
    // as "not filtered" rather than an error — matching `.includes()` against
    // an empty array would match nothing and silently zero out every row,
    // which is a much worse failure than just ignoring a no-op filter.
    const clean = (Array.isArray(values) ? values : []).filter((v): v is string => typeof v === "string");
    if (clean.length > 0) filters[field] = clean;
  }

  // Granularity is a display nicety, not a correctness question, so an
  // invalid/absent one falls back to "month" rather than 400ing — same pattern
  // as the price-growth window.
  const granularity: Granularity = (GRANULARITIES as readonly string[]).includes(
    input.granularity ?? "",
  )
    ? (input.granularity as Granularity)
    : "month";

  return runQuery(src, { groupBy: input.groupBy, isDateGroupBy, granularity, splitBy, aggregation, measure, unit, filters });
}

async function runQuery(
  src: SourceDef,
  q: {
    groupBy: string;
    isDateGroupBy: boolean;
    granularity: Granularity;
    splitBy?: string;
    aggregation: Aggregation;
    measure?: string;
    unit: "currency" | "count";
    filters: Record<string, string[]>;
  },
): Promise<ChartResult> {
  const filterEntries = Object.entries(q.filters);
  const rows = (await src.load()).filter((r) =>
    filterEntries.every(([field, values]) => values.includes(r.cats[field])),
  );
  return q.isDateGroupBy
    ? buildTimeResult(rows, q.granularity, q.splitBy, q.aggregation, q.measure, q.unit)
    : buildCategoryResult(rows, q.groupBy, q.aggregation, q.measure, q.unit);
}

// Distinct values a category field actually has, for a filter dropdown. Same
// load-and-scan approach as everything else here — fine at this app's scale.
export async function listFieldValues(
  source: string,
  field: string,
): Promise<{ values: string[]; truncated: boolean } | { error: string }> {
  const src = SOURCES[source];
  if (!src) return { error: `Unknown data source "${source}"` };
  if (!src.meta.categoryFields.some((f) => f.key === field)) {
    return { error: `"${field}" is not a field on ${src.meta.label}` };
  }

  const rows = await src.load();
  const distinct = new Set<string>();
  for (const r of rows) distinct.add(r.cats[field] ?? "");

  const MAX_VALUES = 1000;
  const sorted = Array.from(distinct).sort((a, b) => a.localeCompare(b));
  return { values: sorted.slice(0, MAX_VALUES), truncated: sorted.length > MAX_VALUES };
}

function buildTimeResult(
  rows: ChartRow[],
  granularity: Granularity,
  splitBy: string | undefined,
  aggregation: Aggregation,
  measure: string | undefined,
  unit: "currency" | "count",
): ChartResult {
  const perSplit = new Map<string, Map<string, number[]>>();
  let rowCount = 0;

  for (const row of rows) {
    if (!row.date) continue;
    const v = valueFor(row, aggregation, measure);
    if (v === null) continue;
    const bucket = bucketDate(row.date, granularity);
    const splitKey = splitBy ? row.cats[splitBy] ?? "(none)" : "all";
    let buckets = perSplit.get(splitKey);
    if (!buckets) {
      buckets = new Map();
      perSplit.set(splitKey, buckets);
    }
    const arr = buckets.get(bucket) ?? [];
    arr.push(v);
    buckets.set(bucket, arr);
    rowCount++;
  }

  const ranked = Array.from(perSplit.entries())
    .map(([key, buckets]) => ({
      key,
      buckets,
      rankValue: Array.from(buckets.values()).reduce((a, arr) => a + arr.reduce((x, y) => x + y, 0), 0),
    }))
    .sort((a, b) => b.rankValue - a.rankValue);

  const kept = splitBy ? ranked.slice(0, MAX_SERIES) : ranked;
  const folded = splitBy ? ranked.slice(MAX_SERIES) : [];

  const series: ChartSeries[] = kept.map(({ key, buckets }) => ({
    key,
    points: Array.from(buckets.entries())
      .map(([bucket, values]) => ({ bucket, value: aggregateValues(values, aggregation) }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
  }));

  if (folded.length > 0) {
    const otherBuckets = new Map<string, number[]>();
    for (const f of folded) {
      for (const [bucket, values] of f.buckets) {
        const arr = otherBuckets.get(bucket) ?? [];
        arr.push(...values);
        otherBuckets.set(bucket, arr);
      }
    }
    series.push({
      key: "Other",
      points: Array.from(otherBuckets.entries())
        .map(([bucket, values]) => ({ bucket, value: aggregateValues(values, aggregation) }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    });
  }

  return { kind: "time", unit, series, otherCount: folded.length, rowCount };
}

function buildCategoryResult(
  rows: ChartRow[],
  groupBy: string,
  aggregation: Aggregation,
  measure: string | undefined,
  unit: "currency" | "count",
): ChartResult {
  const byCat = new Map<string, number[]>();
  let rowCount = 0;

  for (const row of rows) {
    const v = valueFor(row, aggregation, measure);
    if (v === null) continue;
    const cat = row.cats[groupBy] ?? "(none)";
    const arr = byCat.get(cat) ?? [];
    arr.push(v);
    byCat.set(cat, arr);
    rowCount++;
  }

  const ranked = Array.from(byCat.entries())
    .map(([key, values]) => ({ key, values, rankValue: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.rankValue - a.rankValue);

  const kept = ranked.slice(0, MAX_CATEGORIES);
  const folded = ranked.slice(MAX_CATEGORIES);

  const points: ChartSeriesPoint[] = kept.map((k) => ({
    bucket: k.key,
    value: aggregateValues(k.values, aggregation),
  }));

  if (folded.length > 0) {
    const combined = folded.flatMap((f) => f.values);
    points.push({ bucket: "Other", value: aggregateValues(combined, aggregation) });
  }

  points.sort((a, b) => b.value - a.value);

  return {
    kind: "category",
    unit,
    series: [{ key: "all", points }],
    otherCount: folded.length,
    rowCount,
  };
}
