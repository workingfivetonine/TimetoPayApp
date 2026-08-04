import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getUncachableStripeClient, isStripeConfigured } from "../lib/billing/stripeClient";

const router = Router();

// Voluntary support for a free app. Deliberately minimal compared to the
// subscription billing this replaced: a one-off Checkout Session grants nothing,
// so there is no webhook, no stored subscription state, and no entitlement to
// reconcile. Stripe sends the donor their receipt; the app never needs to know
// whether the payment completed.
const PRESET_AMOUNTS_USD = [3, 5, 10, 25];
const MIN_USD = 1;
const MAX_USD = 500;

router.get("/config", (_req, res): void => {
  res.json({ available: isStripeConfigured(), presetAmounts: PRESET_AMOUNTS_USD });
});

router.post("/checkout", async (req, res): Promise<void> => {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Donations aren't set up on this deployment." });
    return;
  }

  const { amountUsd, returnUrl } = req.body as { amountUsd?: unknown; returnUrl?: unknown };
  const amount = typeof amountUsd === "number" ? amountUsd : Number(amountUsd);
  if (!Number.isFinite(amount) || amount < MIN_USD || amount > MAX_USD) {
    res.status(400).json({ error: `Enter an amount between $${MIN_USD} and $${MAX_USD}.` });
    return;
  }

  // Only same-origin returns are accepted: the URL comes from the client, and
  // echoing an arbitrary one into a Stripe redirect would make this an open
  // redirect.
  const base = process.env.APP_ORIGIN ?? "";
  const safeReturn =
    typeof returnUrl === "string" && base && returnUrl.startsWith(base) ? returnUrl : base;
  if (!safeReturn) {
    res.status(500).json({ error: "APP_ORIGIN is not configured." });
    return;
  }

  try {
    // Prefills Stripe's receipt email so the donor gets one without the app
    // storing anything about the payment.
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Cents, and floored: Stripe rejects fractional cents.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.floor(amount * 100),
            product_data: { name: "Support TimetoPay" },
          },
        },
      ],
      success_url: `${safeReturn}?donation=thanks`,
      cancel_url: safeReturn,
      customer_email: user?.email ?? undefined,
    });
    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create donation checkout session");
    res.status(502).json({ error: "Couldn't start the donation. Please try again." });
  }
});

export default router;
