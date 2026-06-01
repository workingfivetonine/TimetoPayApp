import type { Request, Response } from "express";
import { processStripeWebhook } from "../lib/billing/stripeSync";

// Public, Stripe-signed webhook. The raw body (Buffer) is provided by the
// express.raw parser registered in app.ts; signature verification happens inside
// stripe-replit-sync's processWebhook, so an unsigned/forged request is rejected.
export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const signature = req.header("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Invalid webhook body" });
    return;
  }

  try {
    await processStripeWebhook(req.body, signature);
    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Stripe webhook processing failed");
    res.status(400).json({ error: "Webhook processing failed" });
  }
}
