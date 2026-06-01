import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { computeEntitlement } from "../lib/billing/entitlement";

// Server-side entitlement gate for the monetized (web) surface.
//
// The paywall is deliberately WEB-ONLY: native iOS/Android clients are left
// unchanged to avoid app-store IAP policy. We can't perfectly distinguish a
// browser from a native app at the API layer, so we rely on a client-declared
// platform header. This is an accepted limitation — the asset being protected is
// revenue, not private data (every route remains per-user scoped + auth-gated by
// requireAuth regardless). A web user who spoofs the header to bypass the
// paywall is the documented tradeoff of a web-only paywall.
function isNativeClient(req: Request): boolean {
  const platform = req.header("x-client-platform")?.toLowerCase();
  return platform === "ios" || platform === "android";
}

export async function requireEntitlement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  res.status(402).json({ error: "subscription_required", entitlement });
}
