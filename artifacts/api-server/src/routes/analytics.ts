import { Router } from "express";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { receiptsTable, storesTable, lineItemsTable, itemsTable } from "@workspace/db";

const router = Router();

// Weekly spend analytics
router.get("/spend", async (req, res): Promise<void> => {
  const receipts = await db
    .select({ total: receiptsTable.total, purchasedAt: receiptsTable.purchasedAt })
    .from(receiptsTable)
    .orderBy(receiptsTable.purchasedAt);

  if (!receipts.length) {
    res.json({ weeks: [], average: 0, totalSpend: 0, weeklyAverage: 0 });
    return;
  }

  // Group receipts by ISO week
  const weekMap = new Map<string, { total: number; count: number; weekStart: Date; weekEnd: Date }>();

  for (const r of receipts) {
    const d = new Date(r.purchasedAt);
    // Get Monday of that week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const key = monday.toISOString().split("T")[0];
    const existing = weekMap.get(key);
    if (existing) {
      existing.total += Number(r.total);
      existing.count += 1;
    } else {
      weekMap.set(key, { total: Number(r.total), count: 1, weekStart: monday, weekEnd: sunday });
    }
  }

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

// Item price history
router.get("/items/:id/price-history", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.id);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, itemId));
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
    .where(eq(lineItemsTable.itemId, itemId))
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
    averagePrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    lowestPriceStoreName: pricePoints[lowestIdx].storeName,
    pricePoints,
  });
});

// Daily spend for calendar view
router.get("/daily-spend", async (req, res): Promise<void> => {
  const receipts = await db
    .select({ total: receiptsTable.total, purchasedAt: receiptsTable.purchasedAt })
    .from(receiptsTable)
    .orderBy(receiptsTable.purchasedAt);

  const dayMap = new Map<string, { total: number; count: number }>();

  for (const r of receipts) {
    const key = new Date(r.purchasedAt).toISOString().split("T")[0];
    const existing = dayMap.get(key);
    if (existing) {
      existing.total += Number(r.total);
      existing.count += 1;
    } else {
      dayMap.set(key, { total: Number(r.total), count: 1 });
    }
  }

  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      total: Math.round(v.total * 100) / 100,
      receiptCount: v.count,
    }));

  res.json(days);
});

// Store summary
router.get("/stores/:id/summary", async (req, res): Promise<void> => {
  const storeId = parseInt(req.params.id);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const receipts = await db
    .select({ total: receiptsTable.total })
    .from(receiptsTable)
    .where(eq(receiptsTable.storeId, storeId));

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
    receiptCount: receipts.length,
    totalSpend: Math.round(totalSpend * 100) / 100,
    averageReceiptTotal: Math.round(avgReceipt * 100) / 100,
    deliveryAvailable: store.deliveryAvailable,
    deliveryFee,
    minimumOrderAmount: minOrder,
    deliveryCostBenefitNote,
  });
});

export default router;
