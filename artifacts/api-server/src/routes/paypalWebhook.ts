import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  verifyPaypalWebhook,
  getPaypalSubscription,
  mapPaypalStatus,
  isPaypalConfigured,
} from "../lib/billing/paypalClient";

// Public, PayPal-signed webhook. Uses the parsed JSON body. We verify the
// signature server-side via PayPal's verification API before trusting anything,
// then re-read the subscription authoritatively from PayPal to reconcile state.
export async function paypalWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isPaypalConfigured()) {
    res.status(400).json({ error: "PayPal not configured" });
    return;
  }

  const headers: Record<string, string | undefined> = {
    "paypal-auth-algo": req.header("paypal-auth-algo"),
    "paypal-cert-url": req.header("paypal-cert-url"),
    "paypal-transmission-id": req.header("paypal-transmission-id"),
    "paypal-transmission-sig": req.header("paypal-transmission-sig"),
    "paypal-transmission-time": req.header("paypal-transmission-time"),
  };

  let verified = false;
  try {
    verified = await verifyPaypalWebhook(headers, req.body);
  } catch (err) {
    req.log.error({ err }, "PayPal webhook verification error");
  }
  if (!verified) {
    res.status(400).json({ error: "Webhook verification failed" });
    return;
  }

  const event = req.body as {
    event_type?: string;
    resource?: { id?: string; billing_agreement_id?: string };
  };

  // Subscription lifecycle events carry the subscription id in resource.id.
  const subId = event.resource?.id;
  if (event.event_type?.startsWith("BILLING.SUBSCRIPTION.") && subId) {
    try {
      const sub = await getPaypalSubscription(subId);
      // Resolve the user via custom_id (set at creation) with a fallback to the
      // stored paypalSubscriptionId.
      let userId = sub.custom_id ?? null;
      if (!userId) {
        const [byId] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.paypalSubscriptionId, sub.id));
        userId = byId?.id ?? null;
      }
      if (userId) {
        const periodEnd = sub.billing_info?.next_billing_time
          ? new Date(sub.billing_info.next_billing_time)
          : null;
        await db
          .update(usersTable)
          .set({
            subscriptionProvider: "paypal",
            subscriptionStatus: mapPaypalStatus(sub.status),
            subscriptionCurrentPeriodEnd: periodEnd,
            paypalSubscriptionId: sub.id,
          })
          .where(eq(usersTable.id, userId));
        req.log.info(
          { userId, status: sub.status },
          "Reconciled user subscription from PayPal webhook",
        );
      }
    } catch (err) {
      req.log.error({ err }, "Failed to reconcile PayPal subscription");
    }
  }

  res.json({ received: true });
}
