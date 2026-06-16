// Transactional emails sent in response to a user action (not scheduled
// reminders): the signup welcome and the subscription thank-you. These are not
// gated by the notify_* opt-out flags and carry no unsubscribe link — they are
// one-off, account-related messages, not marketing.
import { sendEmail, sendEmailWithTemplate } from "./resendClient";
import {
  renderWelcome,
  renderSubscriptionThankYou,
  renderWelcomeVars,
  renderSubscriptionThankYouVars,
  renderAccountDeleted,
  renderAccountDeletedVars,
} from "./templates";
import { displayNameFromEmail } from "../notifications/snark";
import { logger } from "../logger";

export async function sendWelcomeEmail(email: string): Promise<void> {
  try {
    const name = displayNameFromEmail(email);
    const templateId = process.env.RESEND_TEMPLATE_WELCOME;
    if (templateId) {
      await sendEmailWithTemplate({ to: email, templateId, variables: renderWelcomeVars({ name }) });
    } else {
      await sendEmail({ to: email, ...renderWelcome({ name }) });
    }
  } catch (err) {
    logger.error({ err }, "Welcome email failed");
  }
}

export async function sendSubscriptionThankYouEmail(email: string): Promise<void> {
  try {
    const name = displayNameFromEmail(email);
    const templateId = process.env.RESEND_TEMPLATE_THANK_YOU;
    if (templateId) {
      await sendEmailWithTemplate({ to: email, templateId, variables: renderSubscriptionThankYouVars({ name }) });
    } else {
      await sendEmail({ to: email, ...renderSubscriptionThankYou({ name }) });
    }
  } catch (err) {
    logger.error({ err }, "Subscription thank-you email failed");
  }
}

export async function sendAccountDeletedEmail(
  email: string,
  subscriptionCancelled: boolean,
): Promise<void> {
  try {
    const name = displayNameFromEmail(email);
    const templateId = process.env.RESEND_TEMPLATE_ACCOUNT_DELETED;
    if (templateId) {
      await sendEmailWithTemplate({
        to: email,
        templateId,
        variables: renderAccountDeletedVars({ name, subscriptionCancelled }),
      });
    } else {
      await sendEmail({ to: email, ...renderAccountDeleted({ name, subscriptionCancelled }) });
    }
  } catch (err) {
    logger.error({ err }, "Account-deleted email failed");
  }
}
