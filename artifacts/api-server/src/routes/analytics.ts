import { Router } from "express";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { receiptsTable, storesTable, lineItemsTable, itemsTable, catalogStoresTable, catalogStoreAliasesTable, usersTable, boardPostsTable } from "@workspace/db";
import { groupReceiptsByWeek } from "../lib/analytics/spend";
import { normalizeName } from "../lib/catalog";
import { haversineKm, type LatLng } from "../lib/geocode";
import { isRealPrice, priceStats } from "../lib/prices";

const router = Router();

// Weekly spend analytics
router.get("/spend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const receipts = await db
    .select({ total: receiptsTable.total, purchasedAt: receiptsTable.purchasedAt })
    .from(receiptsTable)
    .where(eq(receiptsTable.userId, userId))
    .orderBy(receiptsTable.purchasedAt);

  if (!receipts.length) {
    res.json({ weeks: [], average: 0, totalSpend: 0, weeklyAverage: 0 });
    return;
  }

  // Group receipts by ISO week (shared helper, also used by the email scheduler)
  const weekMap = groupReceiptsByWeek(receipts);

  const weeks = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  const totals = weeks.map((w) => w.total);
  const weeklyAverage = totals.reduce((a, b) => a + b, 0) / totals.length;
  const totalSpend = totals.reduce((a, b) => a + b, 0);

  const stdDev = Math.sqrt(
    totals.map((t) => Math.pow(t - weeklyAverage, 2)).reduce((a, b) => a + b, 0) / totals.length
  );

  // Recommend a weekly budget once there are at least 4 weeks of data.
  const recommendedWeeklyBudget = weeks.length >= 4 ? Math.round(weeklyAverage * 100) / 100 : null;

  res.json({
    weeks: weeks.map((w) => ({
      weekStart: w.weekStart.toISOString().split("T")[0],
      weekEnd: w.weekEnd.toISOString().split("T")[0],
      total: Math.round(w.total * 100) / 100,
      isHigh: w.total > weeklyAverage + stdDev,
      isLow: w.total < weeklyAverage - stdDev,
      receiptCount: w.count,
    })),
    average: Math.round(weeklyAverage * 100) / 100,
    totalSpend: Math.round(totalSpend * 100) / 100,
    weeklyAverage: Math.round(weeklyAverage * 100) / 100,
    recommendedWeeklyBudget,
  });
});

// Additional fees analytics: how much the user has paid in delivery/service
// fees, totalled for this week / month / year / all-time, plus a per-store
// breakdown (which stores cost the most in fees). Uses the receipts.delivery_fee
// captured at scan time.
router.get("/fees", async (req, res): Promise<void> => {
  const userId = req.userId!;

  // Calendar-window cutoffs in UTC: start of this ISO week (Monday), month, year.
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));

  const feeExpr = sql<number>`COALESCE(SUM(${receiptsTable.deliveryFee}), 0)`;
  const windowSum = (cutoff: Date) =>
    sql<number>`COALESCE(SUM(CASE WHEN ${receiptsTable.purchasedAt} >= ${cutoff.toISOString()} THEN ${receiptsTable.deliveryFee} ELSE 0 END), 0)`;

  const rows = await db
    .select({
      storeId: receiptsTable.storeId,
      storeName: storesTable.name,
      allTime: feeExpr,
      year: windowSum(startOfYear),
      month: windowSum(startOfMonth),
      week: windowSum(startOfWeek),
    })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .where(and(eq(receiptsTable.userId, userId), sql`${receiptsTable.deliveryFee} IS NOT NULL`))
    .groupBy(receiptsTable.storeId, storesTable.name);

  const round = (n: number) => Math.round(Number(n) * 100) / 100;
  const totals = rows.reduce(
    (acc, r) => ({
      week: acc.week + Number(r.week),
      month: acc.month + Number(r.month),
      year: acc.year + Number(r.year),
      allTime: acc.allTime + Number(r.allTime),
    }),
    { week: 0, month: 0, year: 0, allTime: 0 },
  );

  const byStore = rows
    .map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName ?? "Unknown",
      allTime: round(Number(r.allTime)),
    }))
    .filter((s) => s.allTime > 0)
    .sort((a, b) => b.allTime - a.allTime);

  res.json({
    week: round(totals.week),
    month: round(totals.month),
    year: round(totals.year),
    allTime: round(totals.allTime),
    byStore,
  });
});

// "Best of" — actionable where-to-shop insights derived from the user's own
// receipts. Each card is only returned when there's enough data to be honest
// ("cheapest" needs 2+ stores to compare); otherwise the field is null / [] and
// the client hides that card.
router.get("/best-of", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Line-item level rows (for per-item / per-category price comparison).
  const liRows = await db
    .select({
      storeId: receiptsTable.storeId,
      storeName: storesTable.name,
      category: itemsTable.category,
      itemId: lineItemsTable.itemId,
      itemName: itemsTable.name,
      icon: itemsTable.icon,
      price: lineItemsTable.price,
      quantity: lineItemsTable.quantity,
    })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId))
    .leftJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
    .where(eq(receiptsTable.userId, userId));

  // Receipt-level rows (for go-to store, delivery fees).
  const rcptRows = await db
    .select({
      storeId: receiptsTable.storeId,
      storeName: storesTable.name,
      deliveryFee: receiptsTable.deliveryFee,
    })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
    .where(eq(receiptsTable.userId, userId));

  // ── Go-to store: most receipts ──────────────────────────────────────────
  const receiptCounts = new Map<string, number>();
  const feeSum = new Map<string, number>();
  const feeCount = new Map<string, number>();
  for (const r of rcptRows) {
    const name = r.storeName ?? "Unknown";
    receiptCounts.set(name, (receiptCounts.get(name) ?? 0) + 1);
    if (r.deliveryFee != null) {
      feeSum.set(name, (feeSum.get(name) ?? 0) + Number(r.deliveryFee));
      feeCount.set(name, (feeCount.get(name) ?? 0) + 1);
    }
  }
  let goToStore: { storeName: string; receiptCount: number } | null = null;
  for (const [storeName, count] of receiptCounts) {
    if (!goToStore || count > goToStore.receiptCount) goToStore = { storeName, receiptCount: count };
  }

  // ── Delivery fees: cheapest avg + highest total ─────────────────────────
  let cheapestDelivery: { storeName: string; avgFee: number } | null = null;
  let highestFees: { storeName: string; totalFees: number } | null = null;
  for (const [storeName, sum] of feeSum) {
    const n = feeCount.get(storeName) ?? 0;
    if (n > 0) {
      const avg = sum / n;
      if (!cheapestDelivery || avg < cheapestDelivery.avgFee) cheapestDelivery = { storeName, avgFee: round2(avg) };
      if (!highestFees || sum > highestFees.totalFees) highestFees = { storeName, totalFees: round2(sum) };
    }
  }

  // ── Per-(item, store) and per-(category, store) average unit prices ──────
  const itemStore = new Map<number, Map<string, { sum: number; n: number; itemName: string; icon: string | null }>>();
  const catStore = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const r of liRows) {
    const storeName = r.storeName ?? "Unknown";
    const unit = Number(r.price); // unit price already
    // Skip unpriced rows, not just NaN ones. Everything below this point is a
    // price comparison, and a single blank-price row used to drag a store's
    // average to the bottom — winning "cheapest staple", "cheapest by category"
    // and "best value store" on a price nobody was ever charged. See
    // lib/prices.ts.
    if (!isRealPrice(unit)) continue;

    let byStore = itemStore.get(r.itemId);
    if (!byStore) { byStore = new Map(); itemStore.set(r.itemId, byStore); }
    const cell = byStore.get(storeName) ?? { sum: 0, n: 0, itemName: r.itemName, icon: r.icon };
    cell.sum += unit; cell.n += 1;
    byStore.set(storeName, cell);

    const cat = r.category ?? "Other";
    let catByStore = catStore.get(cat);
    if (!catByStore) { catByStore = new Map(); catStore.set(cat, catByStore); }
    const ccell = catByStore.get(storeName) ?? { sum: 0, n: 0 };
    ccell.sum += unit; ccell.n += 1;
    catByStore.set(storeName, ccell);
  }

  // Cheapest staple per item (items bought at 2+ stores), ranked by how often
  // the user buys them (total purchases across stores). Top 6.
  const cheapestStaples = [...itemStore.entries()]
    .map(([, byStore]) => {
      const stores = [...byStore.entries()].map(([storeName, c]) => ({
        storeName, avg: c.sum / c.n, itemName: c.itemName, icon: c.icon, n: c.n,
      }));
      if (stores.length < 2) return null;
      const total = stores.reduce((a, s) => a + s.n, 0);
      const cheapest = stores.reduce((a, b) => (b.avg < a.avg ? b : a));
      return { itemName: cheapest.itemName, icon: cheapest.icon, storeName: cheapest.storeName, price: round2(cheapest.avg), purchases: total };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.purchases - a.purchases)
    .slice(0, 6);

  // Cheapest store per category (categories sold at 2+ stores). Top 6 by coverage.
  const cheapestByCategory = [...catStore.entries()]
    .map(([category, byStore]) => {
      const stores = [...byStore.entries()].map(([storeName, c]) => ({ storeName, avg: c.sum / c.n, n: c.n }));
      if (stores.length < 2) return null;
      const coverage = stores.reduce((a, s) => a + s.n, 0);
      const cheapest = stores.reduce((a, b) => (b.avg < a.avg ? b : a));
      return { category, storeName: cheapest.storeName, avgPrice: round2(cheapest.avg), coverage };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, 6);

  // Best value store: among items sold at 2+ stores, whoever is cheapest most often.
  const wins = new Map<string, number>();
  let comparedItems = 0;
  for (const [, byStore] of itemStore) {
    if (byStore.size < 2) continue;
    comparedItems += 1;
    let best: { storeName: string; avg: number } | null = null;
    for (const [storeName, c] of byStore) {
      const avg = c.sum / c.n;
      if (!best || avg < best.avg) best = { storeName, avg };
    }
    if (best) wins.set(best.storeName, (wins.get(best.storeName) ?? 0) + 1);
  }
  let bestValueStore: { storeName: string; winCount: number; comparedItems: number } | null = null;
  if (comparedItems >= 3) {
    for (const [storeName, w] of wins) {
      if (!bestValueStore || w > bestValueStore.winCount) bestValueStore = { storeName, winCount: w, comparedItems };
    }
  }

  // Closest store: nearest geocoded store to the user's geocoded address.
  const [user] = await db
    .select({ latitude: usersTable.latitude, longitude: usersTable.longitude })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  let closestStore: { storeName: string; distanceKm: number } | null = null;
  if (user?.latitude != null && user?.longitude != null) {
    const userLoc: LatLng = { lat: Number(user.latitude), lng: Number(user.longitude) };
    const geocoded = await db
      .select({ name: storesTable.name, latitude: storesTable.latitude, longitude: storesTable.longitude })
      .from(storesTable)
      .where(eq(storesTable.userId, userId));
    for (const s of geocoded) {
      if (s.latitude == null || s.longitude == null) continue;
      const d = haversineKm(userLoc, { lat: Number(s.latitude), lng: Number(s.longitude) });
      if (!closestStore || d < closestStore.distanceKm) closestStore = { storeName: s.name, distanceKm: Math.round(d * 10) / 10 };
    }
  }

  res.json({
    goToStore,
    bestValueStore,
    cheapestByCategory,
    cheapestStaples,
    cheapestDelivery,
    highestFees,
    closestStore,
  });
});

// Item price history — the deeper analytics insight.
router.get("/items/:id/price-history", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const itemId = parseInt(String(req.params.id));
  const [item] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, itemId), eq(itemsTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const rows = await db
    .select({
      price: lineItemsTable.price,
      purchasedAt: receiptsTable.purchasedAt,
      storeId: storesTable.id,
      storeName: storesTable.name,
      receiptId: receiptsTable.id,
    })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .innerJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .where(and(eq(lineItemsTable.itemId, itemId), eq(receiptsTable.userId, userId)))
    .orderBy(receiptsTable.purchasedAt);

  const pricePoints = rows.map((r) => ({
    date: r.purchasedAt.toISOString().split("T")[0],
    price: Number(r.price),
    storeId: r.storeId,
    storeName: r.storeName,
    receiptId: r.receiptId,
  }));

  if (!pricePoints.length) {
    res.json({
      itemId,
      itemName: item.name,
      icon: item.icon ?? null,
      averagePrice: null,
      lowestPrice: null,
      highestPrice: null,
      lowestPriceStoreName: null,
      pricePoints: [],
    });
    return;
  }

  // Zero-priced rows stay in `pricePoints` (they happened) but are excluded
  // from the stats — see lib/prices.ts.
  const priced = pricePoints.filter((p) => isRealPrice(p.price));
  const stats = priceStats(priced.map((p) => p.price));

  res.json({
    itemId,
    itemName: item.name,
    icon: item.icon ?? null,
    averagePrice: stats?.average ?? null,
    lowestPrice: stats?.lowest ?? null,
    highestPrice: stats?.highest ?? null,
    lowestPriceStoreName: stats ? priced[stats.lowestIndex]!.storeName : null,
    pricePoints,
  });
});

// Daily spend for calendar view
router.get("/daily-spend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const receipts = await db
    .select({ id: receiptsTable.id, total: receiptsTable.total, purchasedAt: receiptsTable.purchasedAt })
    .from(receiptsTable)
    .where(eq(receiptsTable.userId, userId))
    .orderBy(receiptsTable.purchasedAt);

  const dayMap = new Map<string, { total: number; count: number; receiptIds: number[] }>();

  for (const r of receipts) {
    const key = new Date(r.purchasedAt).toISOString().split("T")[0];
    const existing = dayMap.get(key);
    if (existing) {
      existing.total += Number(r.total);
      existing.count += 1;
      existing.receiptIds.push(r.id);
    } else {
      dayMap.set(key, { total: Number(r.total), count: 1, receiptIds: [r.id] });
    }
  }

  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      total: Math.round(v.total * 100) / 100,
      receiptCount: v.count,
      receiptIds: v.receiptIds,
    }));

  res.json(days);
});

// Store summary
router.get("/stores/:id/summary", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const storeId = parseInt(req.params.id);
  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const receipts = await db
    .select({ total: receiptsTable.total })
    .from(receiptsTable)
    .where(and(eq(receiptsTable.storeId, storeId), eq(receiptsTable.userId, userId)));

  const totalSpend = receipts.reduce((sum, r) => sum + Number(r.total), 0);
  const avgReceipt = receipts.length ? totalSpend / receipts.length : 0;

  // Prefer the website the user entered on their own store. Otherwise resolve
  // the private store to its canonical catalog store (by normalized name alias)
  // to surface the admin-set website. Null when neither has one on file.
  let websiteUrl: string | null = (store as { website?: string | null }).website ?? null;
  if (!websiteUrl) {
    const norm = normalizeName(store.name);
    if (norm) {
      const [match] = await db
        .select({ websiteUrl: catalogStoresTable.websiteUrl })
        .from(catalogStoreAliasesTable)
        .innerJoin(catalogStoresTable, eq(catalogStoresTable.id, catalogStoreAliasesTable.catalogStoreId))
        .where(eq(catalogStoreAliasesTable.normalizedName, norm));
      websiteUrl = match?.websiteUrl ?? null;
    }
  }

  const deliveryFee = store.deliveryFee ? Number(store.deliveryFee) : null;
  const minOrder = store.minimumOrderAmount ? Number(store.minimumOrderAmount) : null;

  let deliveryCostBenefitNote: string | null = null;
  if (store.deliveryAvailable && deliveryFee !== null && receipts.length > 0) {
    const feeAsPercent = (deliveryFee / avgReceipt) * 100;
    if (feeAsPercent < 5) {
      deliveryCostBenefitNote = `Delivery adds only ${feeAsPercent.toFixed(1)}% to your avg order — great value`;
    } else if (feeAsPercent < 10) {
      deliveryCostBenefitNote = `Delivery adds ${feeAsPercent.toFixed(1)}% to your avg order — reasonable`;
    } else {
      deliveryCostBenefitNote = `Delivery adds ${feeAsPercent.toFixed(1)}% to your avg order — consider ordering more to offset`;
    }
    if (minOrder !== null && avgReceipt < minOrder) {
      deliveryCostBenefitNote += `. Your avg order ($${avgReceipt.toFixed(2)}) is below the $${minOrder.toFixed(2)} minimum`;
    }
  }

  res.json({
    storeId: store.id,
    storeName: store.name,
    address: store.address ?? null,
    phone: store.phone ?? null,
    openTimes: store.openTimes ?? null,
    websiteUrl,
    receiptCount: receipts.length,
    totalSpend: Math.round(totalSpend * 100) / 100,
    averageReceiptTotal: Math.round(avgReceipt * 100) / 100,
    deliveryAvailable: store.deliveryAvailable,
    deliveryFee,
    minimumOrderAmount: minOrder,
    deliveryCostBenefitNote,
  });
});

// Store visits report — all receipts with line items, plus unique items list
router.get("/stores/:id/visits", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const storeId = parseInt(req.params.id);
  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const rows = await db
    .select({
      receiptId: receiptsTable.id,
      purchasedAt: receiptsTable.purchasedAt,
      itemName: itemsTable.name,
      price: lineItemsTable.price,
      quantity: lineItemsTable.quantity,
    })
    .from(receiptsTable)
    .innerJoin(lineItemsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId))
    .where(and(eq(receiptsTable.storeId, storeId), eq(receiptsTable.userId, userId)))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC, ${receiptsTable.id}, ${itemsTable.name}`);

  // Group rows into visits by receipt id (order preserved by DESC date)
  const visitMap = new Map<number, { purchasedAt: Date; items: { itemName: string; price: number; quantity: number }[] }>();
  for (const row of rows) {
    if (!visitMap.has(row.receiptId)) {
      visitMap.set(row.receiptId, { purchasedAt: row.purchasedAt, items: [] });
    }
    visitMap.get(row.receiptId)!.items.push({
      itemName: row.itemName,
      price: Number(row.price),
      quantity: Number(row.quantity),
    });
  }

  const visits = Array.from(visitMap.entries())
    .sort(([, a], [, b]) => b.purchasedAt.getTime() - a.purchasedAt.getTime())
    .map(([receiptId, v]) => ({
      receiptId,
      purchasedAt: v.purchasedAt.toISOString(),
      items: v.items,
    }));

  const uniqueItems = [...new Set(rows.map((r) => r.itemName))].sort();

  res.json({ storeId: store.id, storeName: store.name, visits, uniqueItems });
});

// Item history report — purchase history across all stores and dates
router.get("/items/:id/history", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const itemId = parseInt(req.params.id);
  const [item] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, itemId), eq(itemsTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const rows = await db
    .select({
      receiptId: receiptsTable.id,
      purchasedAt: receiptsTable.purchasedAt,
      storeName: storesTable.name,
      price: lineItemsTable.price,
      quantity: lineItemsTable.quantity,
    })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .innerJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
    .where(eq(lineItemsTable.itemId, itemId))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC`);

  const history = rows.map((r) => ({
    receiptId: r.receiptId,
    purchasedAt: r.purchasedAt.toISOString(),
    storeName: r.storeName,
    price: Number(r.price),
    quantity: Number(r.quantity),
  }));

  // Same rule as the price-history endpoint: unpriced rows stay in `history`
  // but never set the average or the "cheapest" figure. See lib/prices.ts.
  const stats = priceStats(history.filter((h) => isRealPrice(h.price)).map((h) => h.price));

  const lastPurchasedAt = rows[0]?.purchasedAt ?? null;
  const daysSinceLastPurchase = lastPurchasedAt
    ? Math.floor((Date.now() - lastPurchasedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  res.json({
    itemId: item.id,
    itemName: item.name,
    icon: item.icon ?? null,
    purchaseCount: item.purchaseCount,
    // Null, not 0: an item bought only without a recorded price has an UNKNOWN
    // price, and rendering that as $0.00 reads as "this was free".
    averagePrice: stats?.average ?? null,
    lowestPrice: stats?.lowest ?? null,
    highestPrice: stats?.highest ?? null,
    daysSinceLastPurchase,
    lastPurchasedAt: lastPurchasedAt ? lastPurchasedAt.toISOString() : null,
    ranOutAt: item.ranOutAt ? item.ranOutAt.toISOString() : null,
    history,
  });
});

// Items not purchased in 30+ days, split into 30–60 day and 60+ day buckets
router.get("/items/inactive", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const rows = await db
    .select({
      itemId: itemsTable.id,
      itemName: itemsTable.name,
      icon: itemsTable.icon,
      category: itemsTable.category,
      purchaseCount: itemsTable.purchaseCount,
      lastPurchasedAt: sql<Date>`MAX(${receiptsTable.purchasedAt})`,
    })
    .from(itemsTable)
    .innerJoin(lineItemsTable, eq(lineItemsTable.itemId, itemsTable.id))
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .where(and(eq(itemsTable.userId, userId), eq(receiptsTable.userId, userId)))
    .groupBy(itemsTable.id);

  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const inactive30to60: Array<{ itemId: number; itemName: string; icon: string | null; category: string | null; daysSinceLastPurchase: number; lastPurchasedAt: string; purchaseCount: number }> = [];
  const inactive60plus: typeof inactive30to60 = [];

  for (const row of rows) {
    const days = Math.floor((now - new Date(row.lastPurchasedAt).getTime()) / MS_PER_DAY);
    if (days < 30) continue;
    const entry = {
      itemId: row.itemId,
      itemName: row.itemName,
      icon: row.icon ?? null,
      category: row.category ?? null,
      daysSinceLastPurchase: days,
      lastPurchasedAt: new Date(row.lastPurchasedAt).toISOString(),
      purchaseCount: row.purchaseCount,
    };
    if (days >= 60) {
      inactive60plus.push(entry);
    } else {
      inactive30to60.push(entry);
    }
  }

  const byDaysDesc = (a: { daysSinceLastPurchase: number }, b: { daysSinceLastPurchase: number }) =>
    b.daysSinceLastPurchase - a.daysSinceLastPurchase;

  res.json({
    inactive30to60: inactive30to60.sort(byDaysDesc),
    inactive60plus: inactive60plus.sort(byDaysDesc),
  });
});

// Spend grouped by item category
router.get("/category-spend", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const rows = await db
    .select({
      category: itemsTable.category,
      totalSpend: sql<string>`SUM(${lineItemsTable.price} * ${lineItemsTable.quantity})`,
      itemCount: sql<string>`COUNT(DISTINCT ${itemsTable.id})`,
      purchaseCount: sql<string>`COUNT(${lineItemsTable.id})`,
    })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
    .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId))
    .where(eq(receiptsTable.userId, userId))
    .groupBy(itemsTable.category)
    .orderBy(sql`SUM(${lineItemsTable.price} * ${lineItemsTable.quantity}) DESC`);

  const total = rows.reduce((sum, r) => sum + Number(r.totalSpend), 0);

  res.json({
    categories: rows.map((r) => ({
      category: r.category ?? "Uncategorized",
      totalSpend: Math.round(Number(r.totalSpend) * 100) / 100,
      itemCount: Number(r.itemCount),
      purchaseCount: Number(r.purchaseCount),
      percentOfTotal: total > 0 ? Math.round((Number(r.totalSpend) / total) * 1000) / 10 : 0,
    })),
    totalSpend: Math.round(total * 100) / 100,
  });
});

// Full data export — stores, items, and all line items for the user (used by Excel export)
router.get("/export", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [userRows, stores, items, lineItemRows, boardPosts] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
    db.select().from(storesTable).where(eq(storesTable.userId, userId)).orderBy(storesTable.name),
    db.select().from(itemsTable).where(eq(itemsTable.userId, userId)).orderBy(itemsTable.name),
    db
      .select({
        lineItemId: lineItemsTable.id,
        receiptId: lineItemsTable.receiptId,
        itemId: lineItemsTable.itemId,
        itemName: itemsTable.name,
        itemCategory: itemsTable.category,
        storeName: storesTable.name,
        price: lineItemsTable.price,
        quantity: lineItemsTable.quantity,
        purchasedAt: receiptsTable.purchasedAt,
      })
      .from(lineItemsTable)
      .innerJoin(receiptsTable, eq(receiptsTable.id, lineItemsTable.receiptId))
      .innerJoin(storesTable, eq(storesTable.id, receiptsTable.storeId))
      .innerJoin(itemsTable, eq(itemsTable.id, lineItemsTable.itemId))
      .where(eq(receiptsTable.userId, userId))
      .orderBy(sql`${receiptsTable.purchasedAt} DESC`),
    db
      .select({
        postId: boardPostsTable.id,
        content: boardPostsTable.content,
        tag: boardPostsTable.tag,
        region: boardPostsTable.region,
        status: boardPostsTable.status,
        createdAt: boardPostsTable.createdAt,
      })
      .from(boardPostsTable)
      .where(eq(boardPostsTable.userId, userId))
      .orderBy(sql`${boardPostsTable.createdAt} DESC`),
  ]);

  const profile = userRows[0];

  res.json({
    profile: profile
      ? {
          email: profile.email ?? null,
          username: profile.username ?? null,
          firstName: profile.firstName ?? null,
          lastName: profile.lastName ?? null,
          countryCode: profile.countryCode ?? null,
          stateCode: profile.stateCode ?? null,
          role: profile.role,
          notifyListExport: profile.notifyListExport,
          notifyReceiptReminders: profile.notifyReceiptReminders,
          notifySpendSummary: profile.notifySpendSummary,
          createdAt: profile.createdAt ? profile.createdAt.toISOString() : null,
        }
      : null,
    stores: stores.map((s) => ({
      storeId: s.id,
      name: s.name,
      address: s.address ?? null,
      phone: s.phone ?? null,
    })),
    items: items.map((i) => ({
      itemId: i.id,
      name: i.name,
      category: i.category ?? null,
      icon: i.icon ?? null,
      purchaseCount: i.purchaseCount,
    })),
    lineItems: lineItemRows.map((r) => ({
      lineItemId: r.lineItemId,
      receiptId: r.receiptId,
      itemId: r.itemId,
      itemName: r.itemName,
      itemCategory: r.itemCategory ?? null,
      storeName: r.storeName,
      price: Number(r.price),
      quantity: Number(r.quantity),
      purchasedAt: r.purchasedAt.toISOString(),
    })),
    boardPosts: boardPosts.map((p) => ({
      postId: p.postId,
      content: p.content,
      tag: p.tag ?? null,
      region: p.region ?? null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

export default router;
