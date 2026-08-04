-- Drops the retired billing columns and the free-scan metering table.
--
-- OPTIONAL. Nothing in the app reads any of this — the code that did was deleted
-- in PR #9. Leaving these in place is completely harmless; this script exists only
-- for housekeeping. Every statement is IF EXISTS, so it is safe to re-run and safe
-- to run against a database where some of it is already gone.
--
-- Two ways to apply it:
--   • Neon SQL Editor — paste the whole thing and Run. This is the simplest.
--   • pnpm --filter @workspace/db run push  — from a local checkout with the real
--     DATABASE_URL in .env. Interactive; it will list the same drops for approval.
--
-- ⚠️ This is destructive and cannot be undone. The data is dead, but take a Neon
-- branch/snapshot first if you want a way back. Neon: Branches → New branch.
--
-- What you are NOT doing here: nothing additive. `receipts.tax`,
-- `receipts.discount` and the `shopping_trips` table are created automatically
-- when the server boots (`ensureSchemaColumns` in bootstrap.ts), so they need no
-- manual step. Only drops are manual, on purpose.

BEGIN;

-- ── Subscription state (provider-agnostic) ──────────────────────────────────
ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_status";
ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_provider";
ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_current_period_end";
ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_cancel_at_period_end";

-- ── Trial / onboarding-plan / upsell timestamps ─────────────────────────────
ALTER TABLE "users" DROP COLUMN IF EXISTS "trial_started_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "plan_selected_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "annual_offer_dismissed_at";

-- ── Provider-side identifiers ───────────────────────────────────────────────
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_customer_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_subscription_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "paypal_subscription_id";

-- ── Complimentary-access override (promo codes / email allowlist) ────────────
ALTER TABLE "users" DROP COLUMN IF EXISTS "comp_access";

-- ── Billing notification preference + its two send cursors ──────────────────
ALTER TABLE "users" DROP COLUMN IF EXISTS "notify_payment_reminders";
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_trial_ending_sent_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_past_due_sent_at";

-- ── Free-tier AI scan metering ──────────────────────────────────────────────
-- One row per scan by a non-entitled user. There is no free tier now, so nothing
-- writes or reads this. Index goes with the table.
DROP TABLE IF EXISTS "free_scan_events";

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 0 rows. Anything returned here was not dropped.
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'subscription_status', 'subscription_provider',
    'subscription_current_period_end', 'subscription_cancel_at_period_end',
    'trial_started_at', 'plan_selected_at', 'annual_offer_dismissed_at',
    'stripe_customer_id', 'stripe_subscription_id', 'paypal_subscription_id',
    'comp_access', 'notify_payment_reminders',
    'last_trial_ending_sent_at', 'last_past_due_sent_at'
  );

-- Expect 3 rows: discount, tax, and — separately — the shopping_trips table.
-- If these are MISSING, the server hasn't booted with the new code yet. Don't add
-- them by hand; deploy and let bootstrap.ts do it.
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'receipts' AND column_name IN ('tax', 'discount');

SELECT table_name
FROM information_schema.tables
WHERE table_name = 'shopping_trips';
