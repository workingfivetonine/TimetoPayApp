import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { computeEntitlement } from "../lib/billing/entitlement";
import { getFreeScanUsage } from "../lib/billing/freeScan";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Set by allowFreeSingleScan when a FREE user is permitted a metered scan;
      // the route records the scan only after it succeeds.
      recordFreeScanOnSuccess?: boolean;
    }
  }
}

// User-facing copy returned (verbatim) on a premium denial so the client can
// display it directly without inventing its own message.
export const PREMIUM_REQUIRED_MESSAGE =
  "Subscribe for access to premium AI features";

// Per-feature premium gate for the monetized (web) surface.
//
// The freemium split: free (signed-in but unpaid/lapsed) web users keep full
// access to their OWN data (stores/items/receipts/line-items/shopping-list +
// basic analytics). This gate protects only the PREMIUM surfaces — the
// money-costing AI receipt endpoints and the cross-user global catalog — plus
// the deeper per-item price-history analytics insight.
//
// The paywall is deliberately WEB-ONLY: native iOS/Android clients are left
// unchanged to avoid app-store IAP policy. We can't perfectly distinguish a
// browser from a native app at the API layer, so we rely on a client-declared
// platform header. This is an accepted limitation — a web user who spoofs the
// header to bypass the gate is the documented tradeoff of a web-only paywall.
function isNativeClient(req: Request): boolean {
  const platform = req.header("x-client-platform")?.toLowerCase();
  return platform === "ios" || platform === "android";
}

export const requirePremium: RequestHandler = async (req, res, next) => {
  // Native clients are never paywalled.
  if (isNativeClient(req)) {
    next();
    return;
  }

  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Admins are resolved by requireAuth; skip the DB read for them.
  if (req.isAdmin) {
    next();
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const entitlement = computeEntitlement(user);
  if (entitlement.entitled) {
    next();
    return;
  }

  // Deliberately NOT 402 (which the client treats as "whole app locked").
  // 403 + a user-facing message signals a single premium feature is gated.
  res
    .status(403)
    .json({ error: "premium_required", message: PREMIUM_REQUIRED_MESSAGE, entitlement });
}

// Copy returned when a free user has used up their free scans for the period.
export const FREE_SCAN_LIMIT_MESSAGE =
  "You've used all your free AI scans for now. Subscribe for unlimited scanning, or add receipts manually.";

// Like requirePremium, but lets a FREE user through for a SINGLE-photo scan when
// they're within the free-tier limits (1/week, 4/month). Used only on the
// single-image `parse` endpoint — batch/PDF stay premium-only. When it lets a
// free user through it sets req.recordFreeScanOnSuccess so the route records the
// scan only after it actually succeeds (a failed parse never burns a credit).
export const allowFreeSingleScan: RequestHandler = async (req, res, next) => {
  if (isNativeClient(req)) {
    next();
    return;
  }
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.isAdmin) {
    next();
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const entitlement = computeEntitlement(user);
  if (entitlement.entitled) {
    next();
    return;
  }

  const freeScan = await getFreeScanUsage(userId);
  if (!freeScan.canScan) {
    res
      .status(403)
      .json({ error: "free_scan_limit_reached", message: FREE_SCAN_LIMIT_MESSAGE, entitlement, freeScan });
    return;
  }
  req.recordFreeScanOnSuccess = true;
  next();
};
