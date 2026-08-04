// Transactional lifecycle emails (signup welcome, account-deleted, admin-forced
// password reset). These are sent as Loops EVENTS — the email content and any
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

export async function sendAccountDeletedEmail(email: string): Promise<void> {
  try {
    await loopsSendEvent(email, "account_deleted");
  } catch (err) {
    logger.error({ err }, "Account-deleted event failed");
  }
}

// Sent after an admin forces a reset. Clerk has no admin "send a reset email"
// API, so this is OUR email, and it deliberately carries no credential and no
// magic link — it only points the user at the existing self-service "Forgot
// password" flow on the sign-in screen.
export async function sendPasswordResetRequiredEmail(email: string): Promise<void> {
  try {
    await loopsSendEvent(email, "password_reset_required");
  } catch (err) {
    logger.error({ err }, "Password-reset-required event failed");
  }
}
