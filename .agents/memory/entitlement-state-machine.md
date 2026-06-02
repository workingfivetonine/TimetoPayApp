---
name: Entitlement state machine invariants
description: Subtle correctness rules in computeEntitlement (billing paywall) that are easy to regress.
---

# Entitlement state machine (computeEntitlement)

Non-obvious invariants the entitlement logic MUST preserve. Added after code
reviews caught naive versions getting them wrong:

0. **Trial is OPT-IN and ONE-TIME — there is NO implicit trial from signup.** A
   brand-new user resolves to status `none` / not entitled. The trial window is
   anchored on `users.trialStartedAt` (timestamptz, nullable, NEVER cleared),
   stamped only when the user explicitly calls `POST /billing/start-trial`.
   `canStartTrial` is true only when `!admin && !comp && !trialStartedAt &&
   status∈{null,none}`; start-trial writes race-safely with `WHERE
   trial_started_at IS NULL`. **Do NOT reintroduce a `createdAt`-based trial** —
   signup must grant no subscription.
   **Why:** Product requirement — users must affirmatively choose a trial or
   subscribe; "No subscription" must never display as "Free trial".

1. **Trial window is a FLOOR, not just the not-yet-subscribed case.** Once a user
   has opted in, the trial (from `trialStartedAt + TRIAL_DAYS`) must still grant
   access even when `subscriptionStatus` is a terminal state (`canceled`, or
   `past_due` past grace), as long as `now < trialStartedAt + TRIAL_DAYS`.
   **Why:** A user who opted into a trial, briefly subscribed, and canceled
   within the window should not be locked out early. An earlier version returned
   `entitled:false` immediately on `canceled`.
   **How to apply:** Check active/past-due-grace first, then fall through to the
   trial floor, then lock out. Don't special-case the trial only for `none`/null.

2. **`past_due` must be BOUNDED — never indefinite.** Grace = `periodEnd +
   PAST_DUE_GRACE_DAYS`. If `subscriptionCurrentPeriodEnd` is null (provider data
   gap), do NOT return `entitled:true` unconditionally; fall back to the trial
   floor / lockout.
   **Why:** An earlier version did `entitled = graceEnd ? now < graceEnd : true`,
   granting forever-access to any past_due row with a missing period end.

3. **Don't let users stack the app trial and a provider trial.** Stripe checkout
   must NOT set `subscription_data.trial_period_days` — "Subscribe" means a paid
   sub. Otherwise a user could opt into the 30-day app trial, then near its end
   "Subscribe" and get another 30 free days from Stripe.

Also: admins and comp (redeemed `compAccess` or `COMP_ACCESS_EMAILS`) short-circuit
to entitled before any of this.
