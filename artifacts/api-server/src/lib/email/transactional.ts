// Transactional emails sent in response to a user action (not scheduled
// reminders): the signup welcome and the subscription thank-you. These are not
// gated by the notify_* opt-out flags and carry no unsubscribe link — they are
// one-off, account-related messages, not marketing.
import { sendEmail } from "./resendClient";
import { renderWelcome, renderSubscriptionThankYou } from "./templates";
import { displayNameFromEmail } from "../notifications/snark";
import { logger } from "../logger";

export async function sendWelcomeEmail(email: string): Promise<void> {
  try {
    await sendEmail({ to: email, ...renderWelcome({ name: displayNameFromEmail(email) }) });
  } catch (err) {
    logger.error({ err }, "Welcome email failed");
  }
}

export async function sendSubscriptionThankYouEmail(email: string): Promise<void> {
  try {
    await sendEmail({
      to: email,
      ...renderSubscriptionThankYou({ name: displayNameFromEmail(email) }),
    });
  } catch (err) {
    logger.error({ err }, "Subscription thank-you email failed");
  }
}
