import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { computeEntitlement } from "../lib/billing/entitlement";

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
