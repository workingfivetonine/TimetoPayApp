// Best-effort cancellation of a user's active subscription at their provider, so
// a deleted account stops billing. Never throws — logs and moves on (deletion
// should proceed even if the provider call fails; a stale sub can be cleaned up
// manually, but we must not block account removal).
import { usersTable } from "@workspace/db";
import { getUncachableStripeClient, isStripeConfigured } from "./stripeClient";
import { cancelPaypalSubscription, isPaypalConfigured } from "./paypalClient";
import { logger } from "../logger";

type UserRow = typeof usersTable.$inferSelect;

export async function cancelUserSubscription(user: UserRow): Promise<void> {
  try {
    if (user.subscriptionProvider === "stripe" && user.stripeSubscriptionId) {
      if (!(await isStripeConfigured())) return;
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      logger.info({ userId: user.id }, "Cancelled Stripe subscription (account deletion)");
    } else if (user.subscriptionProvider === "paypal" && user.paypalSubscriptionId) {
      if (!isPaypalConfigured()) return;
      await cancelPaypalSubscription(user.paypalSubscriptionId, "Account deleted");
      logger.info({ userId: user.id }, "Cancelled PayPal subscription (account deletion)");
    }
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to cancel subscription on account deletion");
  }
}
