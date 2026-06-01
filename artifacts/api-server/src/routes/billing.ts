import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
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
import { TRIAL_DAYS, formatCurrentUser } from "../lib/billing/entitlement";
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

  if (parsed.data.provider === "stripe") {
    if (!(await isStripeConfigured())) {
      res.status(400).json({ error: "Stripe is not configured on this deployment." });
      return;
    }
    const stripe = await getUncachableStripeClient();

    let priceId = process.env.STRIPE_PRICE_ID;
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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
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

export default router;
