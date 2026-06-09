import type { usersTable } from "@workspace/db";
import { isCompEmail } from "./promo";

// Provider-agnostic entitlement logic. The single source of truth the app gates
// on is `usersTable.subscriptionStatus` (set ONLY by verified provider webhooks
// or server-side provider reads — never by client-reported success). There is NO
// automatic trial: a brand-new account is "none" (no subscription) until the user
// either opts into the one-time free trial (`trialStartedAt`) or subscribes.

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
  // Whether the one-time free trial offer is still available to this user (never
  // started a trial and never had a provider subscription). Drives the
  // "Start free trial" CTA on the account/paywall screens.
  canStartTrial: boolean;
  // Whether to show the one-time "20% off annual" upsell popup. True only for a
  // free (not entitled) user whose opt-in trial has ENDED, who hasn't already
  // dismissed the offer, and who isn't admin/comped. Never on the public landing
  // page (that's signed-out, so this is always false there).
  showAnnualOffer: boolean;
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
  const status = user.subscriptionStatus as EntitlementStatus | null;

  // The one-time free trial is available only to users who have never started a
  // trial AND never had a provider subscription (status null/none). A canceled or
  // past_due user has already had access and re-subscribes instead.
const canStartTrial =
  !user.isAdmin &&
  user.role !== "family" &&
  !user.compAccess &&
  !isCompEmail(user.email) &&
    !user.trialStartedAt &&
    (status === null || status === "none");

  // The "20% off annual" upsell targets a free user whose opt-in trial has
  // already ELAPSED (so it's offered "after the standard free trial"), who has
  // not yet dismissed it, and who isn't admin/comped. It can only ever be true
  // in the final not-entitled (free) return below — every entitled early-return
  // reports false. Combined with the trial-ended check this is naturally
  // one-time + post-trial.
  const trialEnded =
    user.trialStartedAt != null &&
    now >= new Date(user.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS);
  const annualOfferEligible =
    !user.isAdmin &&
    !user.compAccess &&
    !isCompEmail(user.email) &&
    !user.annualOfferDismissedAt &&
    trialEnded;

  // Admins (operator accounts) are never paywalled.
  if (user.isAdmin) {
    return { entitled: true, status: "active", provider, currentPeriodEnd: iso(periodEnd), canStartTrial: false, showAnnualOffer: false };
  }
 if (user.role === "family") {
  return { entitled: true, status: "comped", provider, currentPeriodEnd: null, canStartTrial: false, showAnnualOffer: false };
}

  // Complimentary access override: a redeemed promo code (persisted as
  // `compAccess`) or a deployer-controlled comp-email allowlist grants free full
  // access regardless of subscription state. This is the "secret override".
  if (user.compAccess || isCompEmail(user.email)) {
    return { entitled: true, status: "comped", provider, currentPeriodEnd: null, canStartTrial: false, showAnnualOffer: false };
  }

  // Active provider subscription always wins.
  if (status === "trialing" || status === "active") {
    return { entitled: true, status, provider, currentPeriodEnd: iso(periodEnd), canStartTrial: false, showAnnualOffer: false };
  }

  // past_due: short grace after the paid period end. If the provider gave us no
  // period end, fall through to lockout (NEVER grant indefinitely).
  if (status === "past_due") {
    const graceEnd = periodEnd
      ? new Date(periodEnd.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS)
      : null;
    if (graceEnd && now < graceEnd) {
      return { entitled: true, status: "past_due", provider, currentPeriodEnd: iso(periodEnd), canStartTrial, showAnnualOffer: false };
    }
    // grace elapsed or unknown → fall through to the opt-in trial / lockout.
  }

  // Opt-in free trial window: 30 days from the moment the user explicitly started
  // the trial (`trialStartedAt`). Not started ⇒ no trial access (status "none").
  if (user.trialStartedAt) {
    const trialEnd = new Date(user.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS);
    if (now < trialEnd) {
      return {
        entitled: true,
        status: "trialing",
        provider,
        currentPeriodEnd: trialEnd.toISOString(),
        canStartTrial: false,
        showAnnualOffer: false,
      };
    }
  }

  // No entitling subscription and no active trial: locked out (free tier). Report
  // the most specific terminal status so the UI can explain why.
  const lockedStatus: EntitlementStatus =
    status === "canceled" ? "canceled" : status === "past_due" ? "past_due" : "none";
  return { entitled: false, status: lockedStatus, provider, currentPeriodEnd: iso(periodEnd), canStartTrial, showAnnualOffer: annualOfferEligible };
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
    // One-time post-signup "Choose your plan" onboarding step completed?
    planSelected: user.planSelectedAt != null,
    entitlement: computeEntitlement(user),
  };
}
