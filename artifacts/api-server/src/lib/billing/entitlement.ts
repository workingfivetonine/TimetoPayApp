import type { usersTable } from "@workspace/db";
import { isCompEmail } from "./promo";

// Provider-agnostic entitlement logic. The single source of truth the app gates
// on is `usersTable.subscriptionStatus` (set ONLY by verified provider webhooks
// or server-side provider reads — never by client-reported success), with the
// implicit app trial as a safety net so existing/new users are never instantly
// locked out before they ever subscribe.

export const TRIAL_DAYS = 30;
// Small grace window after a payment fails (past_due) before access is cut, so a
// transient billing hiccup doesn't immediately lock a paying user out.
export const PAST_DUE_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type EntitlementStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "comped"
  | "none";
export type SubscriptionProvider = "stripe" | "paypal";

export interface Entitlement {
  entitled: boolean;
  status: EntitlementStatus;
  provider: SubscriptionProvider | null;
  currentPeriodEnd: string | null;
}

type UserRow = typeof usersTable.$inferSelect;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function providerOf(user: UserRow): SubscriptionProvider | null {
  return user.subscriptionProvider === "stripe" ||
    user.subscriptionProvider === "paypal"
    ? user.subscriptionProvider
    : null;
}

export function computeEntitlement(
  user: UserRow,
  now: Date = new Date(),
): Entitlement {
  const provider = providerOf(user);
  const periodEnd = user.subscriptionCurrentPeriodEnd;

  // Admins (operator accounts) are never paywalled.
  if (user.isAdmin) {
    return { entitled: true, status: "active", provider, currentPeriodEnd: iso(periodEnd) };
  }

  // Complimentary access override: a redeemed promo code (persisted as
  // `compAccess`) or a deployer-controlled comp-email allowlist grants free full
  // access regardless of subscription state. This is the "secret override".
  if (user.compAccess || isCompEmail(user.email)) {
    return { entitled: true, status: "comped", provider, currentPeriodEnd: null };
  }

  const status = user.subscriptionStatus as EntitlementStatus | null;

  // Implicit app trial window: 30 days from account creation. This acts as a
  // baseline FLOOR — a user is never locked out before it elapses, even in a
  // terminal subscription state (e.g. they briefly subscribed then canceled
  // within the window). It backs "30-day free trial THEN paid".
  const trialEnd = new Date(user.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
  const inTrialWindow = now < trialEnd;

  // Active provider subscription always wins.
  if (status === "trialing" || status === "active") {
    return { entitled: true, status, provider, currentPeriodEnd: iso(periodEnd) };
  }

  // past_due: short grace after the paid period end. If the provider gave us no
  // period end, fall back to the trial floor below (NEVER grant indefinitely).
  if (status === "past_due") {
    const graceEnd = periodEnd
      ? new Date(periodEnd.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS)
      : null;
    if (graceEnd && now < graceEnd) {
      return { entitled: true, status: "past_due", provider, currentPeriodEnd: iso(periodEnd) };
    }
    // grace elapsed or unknown → fall through to the trial floor / lockout.
  }

  // Trial floor: not-yet-subscribed, none, canceled, or past_due past grace all
  // still get access while inside the 30-day window from signup.
  if (inTrialWindow) {
    return {
      entitled: true,
      status: "trialing",
      provider,
      currentPeriodEnd: trialEnd.toISOString(),
    };
  }

  // Trial elapsed and no entitling subscription: locked out. Report the most
  // specific terminal status so the UI can explain why.
  const lockedStatus: EntitlementStatus =
    status === "canceled" ? "canceled" : status === "past_due" ? "past_due" : "none";
  return { entitled: false, status: lockedStatus, provider, currentPeriodEnd: iso(periodEnd) };
}

// Shared shape for the OpenAPI `CurrentUser` response, used by /me and the
// billing routes so entitlement is always reported consistently.
export function formatCurrentUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    role: user.role,
    countryCode: user.countryCode,
    stateCode: user.stateCode,
    entitlement: computeEntitlement(user),
  };
}
