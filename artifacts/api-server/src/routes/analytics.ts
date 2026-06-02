import { Router } from "express";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { receiptsTable, storesTable, lineItemsTable, itemsTable } from "@workspace/db";
import { requirePremium } from "../middlewares/requireEntitlement";
import { groupReceiptsByWeek } from "../lib/analytics/spend";

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
  });
});

// Item price history — the deeper analytics insight, gated as premium on web.
router.get("/items/:id/price-history", requirePremium, async (req, res): Promise<void> => {
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
      averagePrice: 0,
      lowestPrice: 0,
      highestPrice: 0,
      lowestPriceStoreName: "",
      pricePoints: [],
    });
    return;
  }

  const prices = pricePoints.map((p) => p.price);
  const lowestIdx = prices.indexOf(Math.min(...prices));

  res.json({
    itemId,
    itemName: item.name,
    icon: item.icon ?? null,
    averagePrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    lowestPriceStoreName: pricePoints[lowestIdx].storeName,
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

  const prices = history.map((h) => h.price);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const lastPurchasedAt = rows[0]?.purchasedAt ?? null;
  const daysSinceLastPurchase = lastPurchasedAt
    ? Math.floor((Date.now() - lastPurchasedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  res.json({
    itemId: item.id,
    itemName: item.name,
    icon: item.icon ?? null,
    purchaseCount: item.purchaseCount,
    averagePrice: Math.round(avg * 100) / 100,
    lowestPrice: prices.length ? Math.min(...prices) : 0,
    highestPrice: prices.length ? Math.max(...prices) : 0,
    daysSinceLastPurchase,
    lastPurchasedAt: lastPurchasedAt ? lastPurchasedAt.toISOString() : null,
    ranOutAt: item.ranOutAt ? item.ranOutAt.toISOString() : null,
    history,
  });
});

export default router;
