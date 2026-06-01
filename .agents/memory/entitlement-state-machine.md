---
name: Entitlement state machine invariants
description: Subtle correctness rules in computeEntitlement (billing paywall) that are easy to regress.
---

# Entitlement state machine (computeEntitlement)

Two non-obvious invariants the entitlement logic MUST preserve. Both were added
after a code review caught the naive version getting them wrong:

1. **Trial window is a FLOOR, not just the not-yet-subscribed case.** The 30-day
   implicit trial (from `users.createdAt`) must still grant access even when
   `subscriptionStatus` is a terminal state (`canceled`, or `past_due` past
   grace), as long as `now < createdAt + 30d`.
   **Why:** "30-day free trial THEN paid" means a user who briefly subscribed and
   canceled within their first 30 days should not be locked out early. An earlier
   version returned `entitled:false` immediately on `canceled`, locking trial
   users out prematurely.
   **How to apply:** Check active/past-due-grace first, then fall through to the
   trial floor, then lock out. Don't special-case the trial only for `none`/null.

2. **`past_due` must be BOUNDED — never indefinite.** Grace = `periodEnd +
   PAST_DUE_GRACE_DAYS`. If `subscriptionCurrentPeriodEnd` is null (provider data
   gap), do NOT return `entitled:true` unconditionally; fall back to the trial
   floor / lockout.
   **Why:** An earlier version did `entitled = graceEnd ? now < graceEnd : true`,
   granting forever-access to any past_due row with a missing period end.

Also: admins and comp (redeemed `compAccess` or `COMP_ACCESS_EMAILS`) short-circuit
to entitled before any of this.
