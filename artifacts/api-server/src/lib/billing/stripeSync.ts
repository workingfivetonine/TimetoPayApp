import { runMigrations } from "stripe-replit-sync";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getStripeSync, isStripeConfigured } from "./stripeClient";
import type { EntitlementStatus } from "./entitlement";
import { logger } from "../logger";

// Maps a Stripe subscription status onto our provider-agnostic status.
export function mapStripeStatus(s: string): EntitlementStatus {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      // incomplete, paused, etc. — not yet entitling.
      return "none";
  }
}

// One-time startup: create the `stripe` schema, register the managed webhook,
// and backfill existing Stripe data. Safe no-op when Stripe isn't connected.
export async function initStripe(): Promise<void> {
  if (!(await isStripeConfigured())) {
    logger.warn(
      "Stripe is not connected — skipping Stripe init. Connect Stripe via the Integrations tab to enable Stripe billing.",
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Stripe init");

  await runMigrations({ databaseUrl });
  logger.info("Stripe schema ready");

  const sync = await getStripeSync();

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) {
    const webhookUrl = `https://${domain}/api/stripe/webhook`;
    try {
      await sync.findOrCreateManagedWebhook(webhookUrl);
      logger.info({ webhookUrl }, "Stripe managed webhook ready");
    } catch (err) {
      logger.error({ err }, "Failed to set up Stripe managed webhook");
    }
  }

  void sync
    .syncBackfill()
    .then(() => logger.info("Stripe data backfill complete"))
    .catch((err) => logger.error({ err }, "Stripe data backfill failed"));
}

// Reconciles our provider-agnostic user state from a signature-verified Stripe
// subscription event. Called after stripe-replit-sync persists the event.
async function reconcileFromStripeEvent(event: Stripe.Event): Promise<void> {
  if (!event.type.startsWith("customer.subscription.")) return;

  const sub = event.data.object as Stripe.Subscription;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.stripeCustomerId, customerId));
  if (!user) {
    logger.warn(
      { customerId },
      "Stripe subscription event for unknown customer — ignoring",
    );
    return;
  }

  // `current_period_end` lives at the top level on older API versions and on the
  // subscription item on newer ones; read whichever is present.
  const rawEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  const periodEnd =
    typeof rawEnd === "number" ? new Date(rawEnd * 1000) : null;

  await db
    .update(usersTable)
    .set({
      subscriptionProvider: "stripe",
      subscriptionStatus: mapStripeStatus(sub.status),
      subscriptionCurrentPeriodEnd: periodEnd,
      stripeSubscriptionId: sub.id,
    })
    .where(eq(usersTable.id, user.id));

  logger.info(
    { userId: user.id, status: sub.status },
    "Reconciled user subscription from Stripe event",
  );
}

// Verifies + persists a Stripe webhook (via stripe-replit-sync), then maps the
// lifecycle onto the user's provider-agnostic state. The payload buffer is the
// already signature-verified body, so parsing it here is safe.
export async function processStripeWebhook(
  payload: Buffer,
  signature: string,
): Promise<void> {
  const sync = await getStripeSync();
  await sync.processWebhook(payload, signature);

  let event: Stripe.Event | null = null;
  try {
    event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
  } catch {
    event = null;
  }
  if (event) await reconcileFromStripeEvent(event);
}
