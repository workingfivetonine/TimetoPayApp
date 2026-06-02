import { logger } from "../logger";
import { runReminderSweep } from "./reminders";

// In-process opt-in email reminder scheduler. Unref'd timer (single-instance
// deployment). Each reminder type is idempotent per period via the per-type
// "last sent" cursors on the user row, so repeated sweeps (including after a
// restart) never double-send. When Resend isn't configured the sweep is a
// graceful no-op. NOTE: a scale-to-zero deployment may sleep between requests and
// miss ticks — acceptable here (the next tick after wake catches up any reminder
// still inside its window).
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Process-local guard so two ticks can't overlap within this process.
let tickInFlight = false;

async function tick(): Promise<void> {
  if (tickInFlight) {
    logger.debug("Reminder sweep skipped: previous sweep still in flight");
    return;
  }
  tickInFlight = true;
  try {
    await runReminderSweep();
  } catch (err) {
    logger.error({ err }, "Reminder sweep failed");
  } finally {
    tickInFlight = false;
  }
}

export function startReminderScheduler(): void {
  // Hourly by default: granular enough to catch trial-ending windows and
  // start-of-week/month boundaries without hammering the DB.
  const intervalMs = envInt("REMINDER_INTERVAL_MS", 60 * 60 * 1000);
  const initialDelayMs = envInt("REMINDER_INITIAL_DELAY_MS", 90 * 1000);

  const first = setTimeout(() => void tick(), initialDelayMs);
  first.unref();

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();

  logger.info({ intervalMs }, "Email reminder scheduler started");
}
