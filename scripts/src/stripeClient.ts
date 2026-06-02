import Stripe from "stripe";

// Stripe client for seed scripts.
// Reads the secret key directly from the STRIPE_SECRET_KEY environment variable.
// Set this in your Railway Variables tab.

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY environment variable. " +
        "Add it in Railway's Variables tab.",
    );
  }
  return new Stripe(secretKey);
}
