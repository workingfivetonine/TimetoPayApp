import { Router, type Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  CreateBillingCheckoutBody,
  FinalizePaypalSubscriptionBody,
  RedeemPromoCodeBody,
} from "@workspace/api-zod";
import {
  getUncachableStripeClient,
  isStripeConfigured,
} from "../lib/billing/stripeClient";
import {
  isPaypalConfigured,
  isPaypalSandbox,
  createPaypalSubscription,
  getPaypalSubscription,
  mapPaypalStatus,
} from "../lib/billing/paypalClient";
import { computeEntitlement, formatCurrentUser } from "../lib/billing/entitlement";
import { isValidPromoCode } from "../lib/billing/promo";
import { syncSubscriberToLoops } from "../lib/billing/loopsSync";
import { mapStripeStatus } from "../lib/billing/stripeSync";
import { sendSubscriptionThankYouEmail } from "../lib/email/transactional";

const router = Router();

// Base URL of the public web app (same domain as the API behind the proxy).
function webBaseUrl(req: Request): string {
  return process.env.WEB_BASE_URL ?? "https://5to9shopping.com";
}

async function loadUser(userId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user;
}

// Start a subscription checkout with the chosen provider. Returns a redirect URL
// the client opens to complete payment/approval.
router.post("/checkout", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = await loadUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const base = webBaseUrl(req);
  const plan = parsed.data.plan ?? "monthly";

  // Annual billing is Stripe-only for now (the 20%-off post-trial offer). PayPal
  // keeps the monthly plan only.
  if (plan === "annual" && parsed.data.provider !== "stripe") {
    res.status(400).json({ error: "Annual billing is available with card (Stripe) only." });
    return;
  }

  if (parsed.data.provider === "stripe") {
    if (!(await isStripeConfigured())) {
      res.status(400).json({ error: "Stripe is not configured on this deployment." });
      return;
    }
    const stripe = await getUncachableStripeClient();

    // The annual offer uses a dedicated annual price plus a 20%-off coupon
    // (applied as a checkout discount). Monthly is the default plan.
    let priceId: string | undefined;
    let discounts: { coupon: string }[] | undefined;
    if (plan === "annual") {
      priceId = process.env.STRIPE_ANNUAL_PRICE_ID;
      if (!priceId) {
        res.status(400).json({
          error:
            "No annual Stripe price configured. Run the seed-stripe-price script first.",
        });
        return;
      }
      // Annual is a STANDING ~20%-off deal: always apply the annual coupon when
      // configured so the discount the paywall advertises is the price actually
      // charged. (Note: if the coupon's Stripe duration is "once", only the first
      // year is discounted; for a permanent discount set the annual price itself
      // to the discounted amount.)
      const coupon = process.env.STRIPE_ANNUAL_COUPON_ID;
      if (coupon) {
        discounts = [{ coupon }];
      }
    } else {
      priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) {
        const prices = await stripe.prices.list({
          active: true,
          type: "recurring",
          limit: 1,
        });
        priceId = prices.data[0]?.id;
      }
      if (!priceId) {
        res.status(400).json({
          error:
            "No Stripe price configured. Run the seed-stripe-price script first.",
        });
        return;
      }
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(usersTable.id, user.id));
    }

    // No provider-side trial: the free trial is a separate, opt-in path
    // (/billing/start-trial). "Subscribe" means a paid subscription, so a user
    // can't stack the app trial and a Stripe trial for double free time.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(discounts ? { discounts } : {}),
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancel`,
    });

    if (!session.url) {
      res.status(400).json({ error: "Stripe did not return a checkout URL." });
      return;
    }
    res.json({ url: session.url, provider: "stripe" });
    return;
  }

  // PayPal
  if (!isPaypalConfigured()) {
    res.status(400).json({ error: "PayPal is not configured on this deployment." });
    return;
  }
  const planId = process.env.PAYPAL_PLAN_ID;
  if (!planId) {
    res.status(400).json({
      error: "No PayPal plan configured. Run the seed-paypal-plan script first.",
    });
    return;
  }

  const { id, approveUrl } = await createPaypalSubscription({
    planId,
    userId: user.id,
    // Land back on /paywall so the appended ?subscription_id survives for the
    // finalize call (a redirect to / would drop it).
    returnUrl: `${base}/paywall?paypal=success`,
    cancelUrl: `${base}/paywall?paypal=cancel`,
  });

  // Persist the subscription id immediately so the webhook can resolve the user
  // even before the user returns from approval. Status stays unset until the
  // subscription activates (via finalize or webhook).
  await db
    .update(usersTable)
    .set({ subscriptionProvider: "paypal", paypalSubscriptionId: id })
    .where(eq(usersTable.id, user.id));

  if (!approveUrl) {
    res.status(400).json({ error: "PayPal did not return an approval URL." });
    return;
  }
  res.json({ url: approveUrl, provider: "paypal" });
});

// Live subscription prices so the paywall reflects the real Stripe amounts
// instead of hardcoded text. Returns monthly + annual (with the annual coupon's
// percent-off and the resulting effective price). Falls back to sensible
// defaults when Stripe or the price IDs aren't configured.
router.get("/prices", async (_req, res): Promise<void> => {
  const fallback = {
    monthly: { amount: 599, currency: "usd", interval: "month" },
    annual: { amount: 7188, currency: "usd", interval: "year", percentOff: 20, effectiveAmount: 5750 },
  };
  try {
    if (!(await isStripeConfigured())) {
      res.json(fallback);
      return;
    }
    const stripe = await getUncachableStripeClient();
    const monthlyId = process.env.STRIPE_PRICE_ID;
    const annualId = process.env.STRIPE_ANNUAL_PRICE_ID;
    const couponId = process.env.STRIPE_ANNUAL_COUPON_ID;
    const [monthly, annual, coupon] = await Promise.all([
      monthlyId ? stripe.prices.retrieve(monthlyId).catch(() => null) : null,
      annualId ? stripe.prices.retrieve(annualId).catch(() => null) : null,
      couponId ? stripe.coupons.retrieve(couponId).catch(() => null) : null,
    ]);
    const percentOff = coupon?.percent_off ?? 0;
    const annualAmount = annual?.unit_amount ?? fallback.annual.amount;
    const effectiveAmount = percentOff
      ? Math.round(annualAmount * (1 - percentOff / 100))
      : annualAmount;
    res.json({
      monthly:
        monthly?.unit_amount != null
          ? { amount: monthly.unit_amount, currency: monthly.currency, interval: monthly.recurring?.interval ?? "month" }
          : fallback.monthly,
      annual:
        annual?.unit_amount != null
          ? {
              amount: annualAmount,
              currency: annual.currency,
              interval: annual.recurring?.interval ?? "year",
              percentOff,
              effectiveAmount,
            }
          : fallback.annual,
    });
  } catch {
    res.json(fallback);
  }
});

// Returns a provider URL to manage or cancel the current subscription.
router.post("/manage", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = await loadUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const base = webBaseUrl(req);

  if (user.subscriptionProvider === "stripe" && user.stripeCustomerId) {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${base}/`,
    });
    res.json({ url: session.url });
    return;
  }

  if (user.subscriptionProvider === "paypal" && user.paypalSubscriptionId) {
    // PayPal has no per-subscription hosted portal; users manage recurring
    // payments from their PayPal account's automatic-payments page.
    const host = isPaypalSandbox()
      ? "https://www.sandbox.paypal.com"
      : "https://www.paypal.com";
    res.json({ url: `${host}/myaccount/autopay/` });
    return;
  }

  res.status(404).json({ error: "No active subscription to manage." });
});

// Reconcile the caller's subscription state directly from the provider. This is
// a safety net for when a webhook is delayed or missed (e.g. a portal
// cancellation that never synced): the account screen calls this on load so the
// "Renews / Cancels / Premium access ends" label always reflects reality. Reads
// the live subscription authoritatively — never trusts client-reported state.
router.post("/sync", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = await loadUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  try {
    if (user.subscriptionProvider === "stripe" && user.stripeSubscriptionId && (await isStripeConfigured())) {
      const stripe = await getUncachableStripeClient();
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      // current_period_end sits at the top level on older API versions and on the
      // first item on newer ones — read whichever is present.
      const rawEnd =
        (sub as unknown as { current_period_end?: number }).current_period_end ??
        sub.items?.data?.[0]?.current_period_end;
      const periodEnd = typeof rawEnd === "number" ? new Date(rawEnd * 1000) : null;
      const [updated] = await db
        .update(usersTable)
        .set({
          subscriptionStatus: mapStripeStatus(sub.status),
          subscriptionCurrentPeriodEnd: periodEnd,
          subscriptionCancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        })
        .where(eq(usersTable.id, userId))
        .returning();
      void syncSubscriberToLoops(updated);
      res.json(formatCurrentUser(updated));
      return;
    }

    if (user.subscriptionProvider === "paypal" && user.paypalSubscriptionId && isPaypalConfigured()) {
      const sub = await getPaypalSubscription(user.paypalSubscriptionId);
      const periodEnd = sub.billing_info?.next_billing_time
        ? new Date(sub.billing_info.next_billing_time)
        : null;
      const [updated] = await db
        .update(usersTable)
        .set({
          subscriptionStatus: mapPaypalStatus(sub.status),
          subscriptionCurrentPeriodEnd: periodEnd,
          // PayPal has no "cancel at period end" state — a cancel is immediate.
          subscriptionCancelAtPeriodEnd: false,
        })
        .where(eq(usersTable.id, userId))
        .returning();
      void syncSubscriberToLoops(updated);
      res.json(formatCurrentUser(updated));
      return;
    }

    // Nothing to reconcile (no provider subscription) — return current state.
    res.json(formatCurrentUser(user));
  } catch (err) {
    req.log.error({ err }, "Failed to sync subscription from provider");
    // Non-fatal: fall back to the stored state so the account screen still loads.
    res.json(formatCurrentUser(user));
  }
});

// Finalize a PayPal subscription after the user approves it. The server reads
// the subscription authoritatively from PayPal (never trusting client-reported
// success) and reconciles the user's provider-agnostic state.
router.post("/paypal/finalize", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = FinalizePaypalSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isPaypalConfigured()) {
    res.status(400).json({ error: "PayPal is not configured on this deployment." });
    return;
  }

  const owner = await loadUser(userId);
  if (!owner) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let sub;
  try {
    sub = await getPaypalSubscription(parsed.data.subscriptionId);
  } catch {
    res.status(404).json({ error: "Subscription not found." });
    return;
  }

  // Ownership check, FAIL CLOSED. Bind only when we can prove this subscription
  // belongs to the caller: either the custom_id we stamped at creation matches,
  // OR we already persisted this exact subscription id on the user's row at
  // checkout time. An absent/foreign custom_id with no prior binding is rejected
  // (a 404, indistinguishable from "not found") so a caller can't claim someone
  // else's subscription.
  const customIdMatches = sub.custom_id === userId;
  const priorBindingMatches =
    !!owner.paypalSubscriptionId && owner.paypalSubscriptionId === sub.id;
  if (!customIdMatches && !priorBindingMatches) {
    res.status(404).json({ error: "Subscription not found." });
    return;
  }

  const periodEnd = sub.billing_info?.next_billing_time
    ? new Date(sub.billing_info.next_billing_time)
    : null;

  const newStatus = mapPaypalStatus(sub.status);
  const [user] = await db
    .update(usersTable)
    .set({
      subscriptionProvider: "paypal",
      subscriptionStatus: newStatus,
      subscriptionCurrentPeriodEnd: periodEnd,
      paypalSubscriptionId: sub.id,
    })
    .where(eq(usersTable.id, userId))
    .returning();

  // One-time thank-you on the transition into an entitling status.
  const wasEntitling =
    owner.subscriptionStatus === "active" || owner.subscriptionStatus === "trialing";
  if ((newStatus === "active" || newStatus === "trialing") && !wasEntitling && user.email) {
    void sendSubscriptionThankYouEmail(user.email);
  }
  void syncSubscriberToLoops(user);

  res.json(formatCurrentUser(user));
});

// Redeem a promo code for complimentary full access (the "secret override").
// Ungated so a locked-out user can still redeem; auth is still required.
router.post("/redeem", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = RedeemPromoCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isValidPromoCode(parsed.data.code)) {
    res.status(400).json({ error: "Invalid promo code." });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ compAccess: true })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatCurrentUser(user));
});

// Start the one-time, no-payment free trial. Available only to users who have
// never started a trial and never had a provider subscription (see
// computeEntitlement().canStartTrial). Idempotent/race-safe: the update only
// stamps trialStartedAt when it is still null, so a second call can't extend it.
router.post("/start-trial", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = await loadUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!computeEntitlement(user).canStartTrial) {
    res.status(400).json({ error: "A free trial isn't available for this account." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ trialStartedAt: new Date() })
    .where(and(eq(usersTable.id, userId), isNull(usersTable.trialStartedAt)))
    .returning();
  if (!updated) {
    res.status(400).json({ error: "A free trial isn't available for this account." });
    return;
  }

  res.json(formatCurrentUser(updated));
});

// Mark the one-time post-signup "Choose your plan" onboarding step complete so
// the client stops redirecting the user to it. Idempotent: only stamps
// planSelectedAt when still null (a later call won't move the timestamp).
router.post("/plan-selected", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [updated] = await db
    .update(usersTable)
    .set({ planSelectedAt: new Date() })
    .where(and(eq(usersTable.id, userId), isNull(usersTable.planSelectedAt)))
    .returning();
  // Already stamped (or row vanished): re-load and report current state so the
  // call stays idempotent rather than erroring on a second tap.
  const user = updated ?? (await loadUser(userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatCurrentUser(user));
});

// Dismiss the one-time 20%-off annual upsell so it isn't shown again. Idempotent:
// only stamps annualOfferDismissedAt when still null.
router.post("/dismiss-annual-offer", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [updated] = await db
    .update(usersTable)
    .set({ annualOfferDismissedAt: new Date() })
    .where(and(eq(usersTable.id, userId), isNull(usersTable.annualOfferDismissedAt)))
    .returning();
  const user = updated ?? (await loadUser(userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatCurrentUser(user));
});

export default router;
