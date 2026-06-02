import { logger } from "./logger";
import { runAdminDigest } from "./adminDigest";

// Daily admin review digest. Runs an in-process unref'd timer (single-instance
// deployment). The digest itself enforces a min-gap and skips empty windows, so
// a restart loop cannot spam the admin. NOTE: on a scale-to-zero deployment the
// process may sleep between requests and miss ticks — acceptable for a low-stakes
// review digest (the next tick after wake reports everything since the cursor).
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Process-local guard so two scheduled ticks can never overlap within this
// process. Overlap is the only condition under which the DB claim+rollback could
// drop a window (a failing runner's rollback no-ops if another runner already
// advanced the cursor past it). Combined with the single-instance deployment,
// this makes overlapping scheduled runs impossible. Manual test sends never go
// through here, so they're unaffected.
let scheduledTickInFlight = false;

async function tick(): Promise<void> {
  if (scheduledTickInFlight) {
    logger.debug("Admin digest tick skipped: previous tick still in flight");
    return;
  }
  scheduledTickInFlight = true;
  try {
    const result = await runAdminDigest({ trigger: "scheduled" });
    if (!result.sent) {
      logger.debug({ reason: result.reason }, "Admin digest tick: not sent");
    }
  } catch (err) {
    logger.error({ err }, "Admin digest tick failed");
  } finally {
    scheduledTickInFlight = false;
  }
}

export function startAdminDigestScheduler(): void {
  const intervalMs = envInt("ADMIN_DIGEST_INTERVAL_MS", 24 * 60 * 60 * 1000);
  const initialDelayMs = envInt("ADMIN_DIGEST_INITIAL_DELAY_MS", 60 * 1000);

  // Initial run shortly after boot (after startup reconciliations settle).
  const first = setTimeout(() => void tick(), initialDelayMs);
  first.unref();

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();

  logger.info({ intervalMs }, "Admin digest scheduler started");
}
