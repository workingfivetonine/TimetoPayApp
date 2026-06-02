import app from "./app";
import { logger } from "./lib/logger";
import { runStartupReconciliations } from "./lib/bootstrap";
import { initStripe } from "./lib/billing/stripeSync";
import { startAdminDigestScheduler } from "./lib/adminDigestScheduler";
import { startReminderScheduler } from "./lib/notifications/reminderScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Fire-and-forget one-time data reconciliations (idempotent).
  void runStartupReconciliations();

  // One-time Stripe sync setup (schema + managed webhook + backfill). No-op when
  // Stripe isn't connected.
  void initStripe().catch((err) =>
    logger.error({ err }, "Stripe init failed"),
  );

  // Periodic admin review digest (new catalog items / stores / users). Unref'd
  // timers; no-op if Gmail isn't connected or no admin email is on file.
  startAdminDigestScheduler();

  // Periodic opt-in email reminders (payment / list-export / receipt-inactivity
  // / spend summaries) for subscription-related users. Unref'd timer; graceful
  // no-op when SendGrid isn't connected.
  startReminderScheduler();
});
