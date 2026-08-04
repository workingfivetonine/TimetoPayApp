# Handoff — state of work on `claude/timetopay-release-notes-ty1ij4`

Written so this work can be picked up in a different Claude Code session (e.g. VS Code) without
redoing anything. Chat history doesn't move between sessions; everything that matters is here or in
the git history.

**Start by reading:** this file, then `CLAUDE.md` (project conventions, corrected), then
`NEXT_RELEASE_PLAN.md` (the original design doc — parts of it are now history), then
`git log --oneline main..HEAD` — the commit messages carry the reasoning for each decision.

---

## Shipped on this branch (PR #9, draft)

Receipt scanning: PDF cap 4→10 with a skipped-pages warning (pages past the cap used to be dropped
silently); `PATCH /api/receipts/:id/store` plus tap-to-edit store name; shared `StoreNameField`
autocomplete; camera capture; full-screen pinch-zoom receipt viewer; Save & Next / Save & Close;
tax and discount captured as receipt-level fields; store-scoped fuzzy item matching; batch review
gained inline line-item and store editing.

Board and admin: authors can edit/delete their own posts and replies, admins can delete any;
filter/chip rows no longer collapse; usernames and richer user info in admin views and the digest
email; admins can force a password reset.

Shopping list: "Download" → "Create List", Select all / Deselect all, custom-item field moved to
the top.

Share-to-app: `expo-share-intent` wired in — **not verified**, see Blocked below.

### Three things need doing before this is fully live

1. **DB migration — now optional, and only for the destructive half.** The additive changes
   (`receipts.tax`, `receipts.discount`, `shopping_trips`) are applied automatically at server boot by
   `ensureSchemaColumns` in `bootstrap.ts`, per the repo's established convention, so a deploy landing
   before any manual step degrades gracefully instead of 500ing. Running
   ```
   pnpm --filter @workspace/db run push
   ```
   is therefore only needed if you also want to **drop** the retired billing columns
   (`subscription_*`, `trial_started_at`, `plan_selected_at`, `annual_offer_dismissed_at`,
   `stripe_*`, `paypal_subscription_id`, `comp_access`, `notify_payment_reminders`,
   `last_trial_ending_sent_at`, `last_past_due_sent_at`). Read the prompts — dropping them is
   intended and the data is dead, but it is destructive, so decide deliberately rather than accepting
   blind. Leaving them in place is harmless; nothing reads them.
   (Couldn't run here — no `DATABASE_URL` in the cloud container. A local session with the real
   `.env` can just run it.)
2. **Share-to-app is unverified.** The share target comes from `Info.plist`/`AndroidManifest`
   entries the config plugin writes at prebuild, so it's inert in Expo Go and on web and needs an
   EAS or local dev-client build. What *is* verified: `expo config --type introspect` shows the
   `SEND` filter with `image/*` and `application/pdf` plus the iOS activation rules.
   Caveat found: the plugin's declared type for `androidIntentFilters` is
   `("text/*"|"image/*"|"video/*"|"*/*")[]`, so `application/pdf` is off-contract. It works today
   (introspect confirms it reaches the manifest, and it's valid Android) but a future plugin
   version could start dropping it. `*/*` is the "safe" value but puts TimetoPay in the share sheet
   for every file type — worse UX, so `application/pdf` was kept deliberately.
3. **Loops templates and one env var.** `trip_receipt_missing` and `password_reset_required` need
   templates in the Loops dashboard or those emails are silent no-ops — the code is correct and
   nothing arrives. And Railway needs `OPENAI_API_KEY` set before the next deploy: the OpenAI client
   throws at import, so a stale `AI_INTEGRATIONS_OPENAI_API_KEY` alone means the server won't boot.

---

## Shipped since: Shopping Mode, payment removal, Replit disconnect

**Shopping Mode.** The shopping tab is now three sub-tabs behind a segmented control — Items
(`SectionList`, unchanged), Create list (the former modal rendered inline), Shopping
(`components/ShoppingModeView.tsx`: only the ticked items, 28px checkboxes, strike-through on picked,
running basket total). `excluded` + `customItems` are lifted into `shopping.tsx` — required, not
cosmetic: selection used to reset on every modal open, which would wipe it on each tab switch.
A trip ends **only** on the explicit "Done shopping" button, which POSTs to
`/api/shopping-list/trips` fire-and-forget. Per-trip `picked` state is deliberately not persisted.

Reminders: `maybeTripReceiptMissing` in `lib/notifications/reminders.ts` fires `trip_receipt_missing`
a week after a trip closes with no receipt logged since. Trip state lives on `shopping_trips`
(`lib/db/src/schema/shoppingTrips.ts`), and `reminderSentAt` makes it once-per-trip rather than
once-per-month, so weekly shoppers get one nudge per missed trip. Only CLOSED trips are recorded, so
an abandoned trip can never produce a reminder. The trip-anchored nudge is tried before the generic
inactivity one and suppresses it in the same sweep.

**Live bug fixed on the way.** The reminder sweep gated eligibility on real billing status, so once
the app went free almost nobody reached the per-type checks and all four reminder types were reaching
essentially no one. Eligibility is now any user with an email past the 2-day signup grace, with the
per-type opt-in toggles (all default false) deciding who is emailed. **Consequence: reminders now
actually send** to people who had opted in and were getting nothing.

**Payment / premium removal.** The app was already free — `computeEntitlement` returned
`{entitled: true, status: "comped"}` unconditionally and `usePremiumLock` only read `.entitled`, so
every paywall, upsell and badge was already unreachable dead code. This was therefore a cleanup, not
a behaviour change. Deleted: the paywall / pricing / choose-plan / admin-subscriptions screens,
`PremiumUpsell`, `PremiumBadge`, `AnnualOfferModal`, `EntitlementBanner`, `usePremiumLock`; server
`lib/billing/` in full plus the Stripe and PayPal webhooks, `requireEntitlement`, `freeScanEvents`,
and `routes/donate.ts` (nothing called it — the donation is a static Payment Link, so no Stripe SDK
or secret key remains anywhere); the subscription/trial/comp columns on `usersTable`; and every
`/billing/*` path, `/admin/subscribers`, `UserEntitlement` and `AdminSubscriber` from the OpenAPI
spec. `formatCurrentUser` was moved to `lib/currentUser.ts` first — it lived inside
`lib/billing/entitlement.ts`, so deleting that directory would have broken `GET /me`.

The only money reference left in the app is the optional donation card on the landing and account
screens (`EXPO_PUBLIC_DONATE_URL`).

**Replit disconnect.** `AI_INTEGRATIONS_OPENAI_BASE_URL`/`_API_KEY` are now `OPENAI_API_KEY` (with
an optional `OPENAI_BASE_URL` for a compatible proxy). Note the old base URL was already
`https://api.openai.com/v1` per the README, so this was never a Replit-proxied endpoint and `gpt-5.2`
was always being called against OpenAI directly — no model-availability risk in the switch.
`stripe-replit-sync` went out with billing, which also removed the recurring build warning. Deleted
the dead duplicate `lib/integrations/openai_ai_integrations/` layer, `ReplitLoadingScene.tsx`, the
`@replit/vite-plugin-*` dev plugins from the three Vite artifacts, and `scripts/test-pdf-parse.cjs`
(hard-coded `/home/runner/workspace` paths). The screenshot scripts now read
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` / `EXPO_DEV_DOMAIN`. `.replit` no longer declares integrations or
carries live Stripe/PayPal price IDs.

Docs: `replit.md` was wrong on five counts and is replaced by `CLAUDE.md`, corrected and brought up
to date — Clerk is stock `@clerk/express`/`@clerk/expo`, there is no Stripe connector or
`REPLIT_DEPLOYMENT` gating, reminders and the admin digest both go through Loops (not Resend/Gmail),
and the "Deployment (web app + Expo Go)" section described `scripts/build.js` and `server/serve.js`,
neither of which exists — deployment is Railway + Vercel. `README.md` and `threat_model.md` corrected
too, and six obsolete `.agents/memory/` notes deleted.

---

## Also discussed, not started

- **Email-in receipts.** Blocked on a DNS/provider decision (Postmark Inbound recommended) —
  provider choice determines the webhook payload shape and signature scheme. Provider-agnostic parts
  are buildable now: per-user address token, Account-settings UI, and refactoring the parse core out
  of the route handler so a webhook can call it. Cost control: attachment metadata arrives as parsed
  JSON *before* any model call, so no-attachment / wrong-mimetype / oversize / unverified-sender all
  reject for free, and PDF page count is known from `pdfinfo` before rasterising.
- **AI cost note worth fixing:** `chargeGlobalAiBudget` is charged once per *request*, not per page
  (`receipts.ts` ~line 1177, outside the page loop), so a 10-page PDF consumes 1 unit of the
  5000/day budget while making 10 model calls. Predates this work, but raising the cap 4→10 made it
  2.5× worse.

## Conventions worth knowing

- `pnpm run typecheck` (runs `typecheck:libs` first) and `pnpm run build` both pass on this branch.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.
  The client has now been regenerated with the pinned orval 8.17.0 (it had been built with 8.9.1), so
  the one-off large formatting diff is already absorbed and future regens should be small.
  `Store.logoUrl` was missing from the spec and only survived because the stale generated file still
  had it — the spec now declares it.
- Tests (`pnpm --filter @workspace/api-server run test`) can't run without `DATABASE_URL`: the vitest
  config derives a test DB from it and throws at load time. They were not run for this work.
