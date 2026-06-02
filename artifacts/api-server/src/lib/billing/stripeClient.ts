import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

// Stripe client for the API server.
// Reads credentials directly from environment variables (set in Railway Variables tab).
// Required env vars:
//   STRIPE_SECRET_KEY      — your Stripe secret key (from stripe.com → Developers → API Keys)
//   STRIPE_WEBHOOK_SECRET  — your webhook signing secret (from stripe.com → Developers → Webhooks)
//   DATABASE_URL           — your Neon connection string

function getStripeCredentials(): { secretKey: string; webhookSecret?: string } {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY environment variable. " +
        "Add it in Railway's Variables tab.",
    );
  }
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const { secretKey, webhookSecret } = getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}

export async function isStripeConfigured(): Promise<boolean> {
  try {
    getStripeCredentials();
    return true;
  } catch {
    return false;
  }
}
