// Push the billing facts the app knows about a user onto their Loops contact,
// so Loops can segment/personalize (e.g. "annual plan", "renews this week",
// "cancelling") without needing the Stripe→Loops integration. Called whenever a
// subscription changes. Best-effort; never throws.
import { loopsUpsertContact } from "../email/loops";
import { computeEntitlement, TRIAL_DAYS } from "./entitlement";
import type { usersTable } from "@workspace/db";

type UserRow = typeof usersTable.$inferSelect;
const DAY_MS = 24 * 60 * 60 * 1000;

// Map a Stripe price id to a human plan label using the configured price envs.
export function planFromStripePriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_ANNUAL_PRICE_ID) return "annual";
  if (priceId === process.env.STRIPE_PRICE_ID) return "monthly";
  return null;
}

export async function syncSubscriberToLoops(
  user: UserRow,
  plan?: string | null,
): Promise<void> {
  if (!user.email) return;
  const ent = computeEntitlement(user);
  const trialEndsAt = user.trialStartedAt
    ? new Date(user.trialStartedAt.getTime() + TRIAL_DAYS * DAY_MS).toISOString()
    : null;
  await loopsUpsertContact(user.email, {
    subscriptionStatus: user.subscriptionStatus ?? "none",
    subscriptionProvider: user.subscriptionProvider ?? null,
    // PayPal is monthly-only; Stripe plan is derived from the price id.
    plan: plan ?? (user.subscriptionProvider === "paypal" ? "monthly" : null),
    renewsOn: user.subscriptionCurrentPeriodEnd ? user.subscriptionCurrentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: !!user.subscriptionCancelAtPeriodEnd,
    entitled: ent.entitled,
    trialEndsAt,
  });
}
