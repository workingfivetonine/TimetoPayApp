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

const router = Router();

// Base URL of the public web app (same domain as the API behind the proxy).
function webBaseUrl(req: Request): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  return `${proto}://${req.get("host")}`;
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
      // The 20% coupon is the ONE-TIME post-trial offer. Enforce eligibility
      // server-side (not just in the client modal) so it can't be requested
      // repeatedly for unlimited discounted checkouts: apply the coupon ONLY when
      // the user currently qualifies (computeEntitlement.showAnnualOffer = free,
      // trial ended, not dismissed). Ineligible users may still buy annual, but
      // at full price.
      const coupon = process.env.STRIPE_ANNUAL_COUPON_ID;
      if (coupon && computeEntitlement(user).showAnnualOffer) {
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

  const [user] = await db
    .update(usersTable)
    .set({
      subscriptionProvider: "paypal",
      subscriptionStatus: mapPaypalStatus(sub.status),
      subscriptionCurrentPeriodEnd: periodEnd,
      paypalSubscriptionId: sub.id,
    })
    .where(eq(usersTable.id, userId))
    .returning();

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
