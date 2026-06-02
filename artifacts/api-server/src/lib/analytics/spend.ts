// Shared spend aggregation used by BOTH the analytics route and the email
// reminder scheduler, so weekly/monthly totals are computed one way only.

export interface SpendReceipt {
  total: string | number;
  purchasedAt: Date;
}

export interface WeekBucket {
  weekStart: Date;
  weekEnd: Date;
  total: number;
  count: number;
}

// Monday 00:00:00.000 of the week containing `d` (weeks are Monday-anchored,
// matching the analytics view).
export function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Sunday 23:59:59.999 of the week that starts on `monday`.
export function sundayOf(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

// First-of-month 00:00:00.000 of the month containing `d`.
export function monthStartOf(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

// Group receipts by Monday-anchored ISO week. Keyed by the week-start ISO date
// (yyyy-mm-dd) so callers can sort chronologically.
export function groupReceiptsByWeek(
  receipts: SpendReceipt[],
): Map<string, WeekBucket> {
  const weekMap = new Map<string, WeekBucket>();
  for (const r of receipts) {
    const d = new Date(r.purchasedAt);
    const monday = mondayOf(d);
    const sunday = sundayOf(monday);
    const key = monday.toISOString().split("T")[0];
    const existing = weekMap.get(key);
    if (existing) {
      existing.total += Number(r.total);
      existing.count += 1;
    } else {
      weekMap.set(key, { total: Number(r.total), count: 1, weekStart: monday, weekEnd: sunday });
    }
  }
  return weekMap;
}

// Sum receipt totals in the half-open interval [start, end).
export function sumReceiptsInRange(
  receipts: SpendReceipt[],
  start: Date,
  end: Date,
): number {
  let total = 0;
  for (const r of receipts) {
    const t = new Date(r.purchasedAt).getTime();
    if (t >= start.getTime() && t < end.getTime()) {
      total += Number(r.total);
    }
  }
  return Math.round(total * 100) / 100;
}

export type ChangeDirection = "up" | "down" | "flat";

export interface PeriodComparison {
  total: number;
  previousTotal: number;
  changeAmount: number;
  changeDirection: ChangeDirection;
}

// Compare a period's total against the previous period's total. `changeAmount`
// is the absolute (always non-negative) magnitude of the difference; the sign is
// carried by `changeDirection`.
export function comparePeriods(total: number, previousTotal: number): PeriodComparison {
  const diff = Math.round((total - previousTotal) * 100) / 100;
  const direction: ChangeDirection = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return {
    total: Math.round(total * 100) / 100,
    previousTotal: Math.round(previousTotal * 100) / 100,
    changeAmount: Math.abs(diff),
    changeDirection: direction,
  };
}
