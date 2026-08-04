import Stripe from "stripe";

// Stripe client for the API server. The app is free — this exists solely for
// voluntary one-off donations, so there is no subscription state to sync, no
// webhook to verify, and nothing to unlock when a payment succeeds. Stripe emails
// the donor their own receipt.
//
// Required env var:
//   STRIPE_SECRET_KEY — from stripe.com → Developers → API Keys
// (STRIPE_WEBHOOK_SECRET, the price/plan ids and the whole stripe-replit-sync
// engine are gone along with subscriptions.)
function getSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY environment variable. Add it in Railway's Variables tab.",
    );
  }
  return secretKey;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return new Stripe(getSecretKey());
}

// Donations are optional, so every caller must tolerate Stripe being unset — an
// unconfigured deployment simply doesn't offer the donate button.
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
