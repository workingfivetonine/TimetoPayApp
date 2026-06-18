// Transactional lifecycle emails (signup welcome, subscription thank-you,
// account-deleted). These are sent as Loops EVENTS — the email content and any
// follow-up automation are built in the Loops dashboard, keyed to the event
// name. Each call also keeps the Loops contact's properties fresh. No Resend.
import { loopsSendEvent, loopsUpsertContact } from "./loops";
import { displayNameFromEmail } from "../notifications/snark";
import { logger } from "../logger";

export async function sendWelcomeEmail(email: string, name?: string | null): Promise<void> {
  try {
    const firstName = name?.trim() || displayNameFromEmail(email);
    await loopsUpsertContact(email, { firstName });
    await loopsSendEvent(email, "welcome", { contactProperties: { firstName } });
  } catch (err) {
    logger.error({ err }, "Welcome event failed");
  }
}

export async function sendSubscriptionThankYouEmail(email: string): Promise<void> {
  try {
    await loopsSendEvent(email, "subscription_started", {
      contactProperties: { subscriptionStatus: "active" },
    });
  } catch (err) {
    logger.error({ err }, "Subscription thank-you event failed");
  }
}

export async function sendAccountDeletedEmail(
  email: string,
  subscriptionCancelled: boolean,
): Promise<void> {
  try {
    await loopsSendEvent(email, "account_deleted", {
      eventProperties: { subscriptionCancelled },
    });
  } catch (err) {
    logger.error({ err }, "Account-deleted event failed");
  }
}
