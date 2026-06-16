// Free-tier AI scan metering. Non-entitled (free) web users get a small taste of
// AI receipt scanning — a single photo at a time, capped at 1 per rolling 7 days
// AND 4 per rolling 30 days. Entitled/native/admin users are never metered.
import { and, eq, gt } from "drizzle-orm";
import { db, freeScanEventsTable } from "@workspace/db";

export const FREE_SCAN_PER_WEEK = 1;
export const FREE_SCAN_PER_MONTH = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FreeScanUsage {
  week: number; // scans in the last 7 days
  month: number; // scans in the last 30 days
  weekLimit: number;
  monthLimit: number;
  canScan: boolean; // within both limits
}

export async function getFreeScanUsage(
  userId: string,
  now: Date = new Date(),
): Promise<FreeScanUsage> {
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const rows = await db
    .select({ createdAt: freeScanEventsTable.createdAt })
    .from(freeScanEventsTable)
    .where(and(eq(freeScanEventsTable.userId, userId), gt(freeScanEventsTable.createdAt, monthAgo)));
  const month = rows.length;
  const week = rows.filter((r) => r.createdAt.getTime() > weekAgo).length;
  return {
    week,
    month,
    weekLimit: FREE_SCAN_PER_WEEK,
    monthLimit: FREE_SCAN_PER_MONTH,
    canScan: week < FREE_SCAN_PER_WEEK && month < FREE_SCAN_PER_MONTH,
  };
}

export async function recordFreeScan(userId: string): Promise<void> {
  await db.insert(freeScanEventsTable).values({ userId });
}
