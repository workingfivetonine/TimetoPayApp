# Handoff — state of work on `claude/timetopay-release-notes-ty1ij4`

Written so this work can be picked up in a different Claude Code session (e.g. VS Code) without
redoing anything. Chat history doesn't move between sessions; everything that matters is here or in
the git history.

**Start by reading:** this file, then `NEXT_RELEASE_PLAN.md` (the full design doc), then
`git log --oneline main..HEAD` — the commit messages carry the reasoning for each decision.

---

## Shipped and pushed (11 commits, PR #9, draft)

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

### Two things need doing before this is fully live

1. **DB migration required.** Tax/discount added two columns. Without this, saving a scan fails:
   ```
   pnpm --filter @workspace/db run push
   ```
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

---

## IN FLIGHT: Shopping Mode (task 19)

**The design (confirmed with the owner):** the shopping tab becomes three sub-tabs behind a
segmented control — (1) **Items list** (today's `SectionList`, unchanged), (2) **Create list**
(today's `ShoppingListPdfModal` content, inline instead of modal), (3) **Shopping mode** (focused
trip view: only the ticked items, empty checkboxes to tick off while shopping).

**Done so far** — commit `9a48ad6` made `ShoppingListPdfModal` capable of both, additively, with the
modal path unchanged and everything typechecking:
- `inline` prop drops the overlay/sheet framing, close button and Cancel button.
- `excluded` / `onExcludedChange` make selection parent-controlled. **Lifting this is required, not
  cosmetic:** selection resets on every modal open today, which would wipe it on each tab switch,
  and Shopping Mode has to read the ticked set.
- The reset-on-open effect is skipped when inline; merge suggestions get their own effect since
  inline has no "open" moment.

**Still to build:**
1. `shopping.tsx`: `view` state (`"items" | "create" | "shop"`) + a segmented control under the
   header. Lift `excluded` (and probably `customItems`) into this screen.
2. Render the builder with `inline` for the Create-list tab.
3. New Shopping Mode view. **Do not reuse `ShoppingListItemRow`** — its Ran Out / Buy More button is
   unconditional and there's no leading-slot prop. The checkbox row inside `ShoppingListPdfModal`
   (`renderItem`, ~line 433-509) is the closer template. Item type is the generated
   `ShoppingListItem` (`itemId`, `itemName`, `icon`, `category`, `ranOutAt`, price fields).
4. Full-screen precedent if a route is wanted instead of a sub-tab view: `batch-review.tsx`,
   registered `presentation: "fullScreenModal"` at `_layout.tsx:148` with its own in-body header.

**Decisions already settled, don't re-litigate:**
- Items shown in Shopping Mode = whatever is ticked in Create list (the inverse of `excluded`). It
  starts pre-populated because Create list starts everything ticked; Deselect all is how you start
  from nothing.
- The trip ends **only** on an explicit "Done shopping" button. With sub-tabs, switching away isn't
  leaving the screen, and backgrounding mid-shop is normal — anything else fires reminders the user
  didn't earn.

### Task 20 — Shopping Mode reminders (not started, and partly unresearched)

On trip close: an in-app prompt to upload the receipt, plus a week-later email if no receipt has
been uploaded since. Needs a shopping-session record (trip close time + whether a receipt followed)
and a 5th type added to the **existing** reminder scheduler — reuse its cadence/cursor
infrastructure, don't build a second scheduler.

⚠️ The research agent mapping that reminder infrastructure never reported back. Re-run it before
building: find the scheduler under `artifacts/api-server/src/lib/`, work out how the 4 existing
types decide to send and how their per-type cursors advance, and check whether reminders go through
Loops or Resend. Note billing removal (below) deletes two of those four types, so sequence these
together.

---

## QUEUED

### Remove all payment / premium / paywall entirely (tasks 21, 22)
Owner confirmed: **fully free app, and no live subscriptions**, so there's no wind-down risk — but
note that deleting billing code does *not* cancel provider-side subscriptions, so re-confirm that's
still true before deleting.

Client: delete `paywall.tsx`, `pricing.tsx`, `choose-plan.tsx`, `PremiumUpsell`, `PremiumBadge`,
`AnnualOfferModal`, `EntitlementBanner`, `usePremiumLock`. Unlock gating in `scan.tsx`,
`(tabs)/board.tsx`, `(tabs)/analytics.tsx`, `catalog.tsx`, `(tabs)/index.tsx`, `account.tsx`,
`(tabs)/_layout.tsx`, `_layout.tsx`, `DesktopSidebar.tsx`.

Server: Stripe (incl. `stripe-replit-sync`), PayPal, `entitlement.ts`, `freeScan.ts`,
`requirePremium`/`allowFreeSingleScan`, billing routes and webhooks, promo/comp access, the admin
subscribers view, and the trial-ending + payment-past-due reminders. Retire the billing columns on
`usersTable`.

Note: board eligibility currently requires a subscription (`checkBoardEligibility`), and scan gating
(`locked`, `canFreeScan`, `promptUpgrade`) runs through `scan.tsx` — expect to rewrite parts of what
was just shipped there. Shopping list and Create List have **no** premium gating, which is why
Shopping Mode was safe to do first.

### Replit disconnect (task 23) — audit done, job is small
No `REPLIT_*` var is read anywhere in server code. Real runtime surface is two env vars and one package:

- **`AI_INTEGRATIONS_OPENAI_BASE_URL` / `_API_KEY`** (`lib/integrations-openai-ai-server/src/client.ts:3,9,16,17`)
  — hard boot blocker: throws at import, no fallback, imported top-level by `routes/receipts.ts:18`
  and `routes/adminCatalog.ts:25`. But the `openai` export is just a plain `openai` v6 SDK client
  with a custom `baseURL`; every consumer only calls `chat.completions.create`. **≈30 min:** swap to
  `OPENAI_API_KEY`, drop `baseURL`. Two consequences: `gpt-5.2` must be valid on api.openai.com
  directly, and AI cost moves to your own OpenAI account.
- **`stripe-replit-sync`** — moot once billing is deleted. Worth knowing: despite the name it isn't
  a Replit service, it's a rebadged fork of Supabase's `stripe-sync-engine`. Its migration step has
  been **silently broken** — `build.mjs:130` resolves `stripe-replit-sync/package.json`, which the
  package's `exports` map doesn't expose, so the catch at `:135` always fires and `runMigrations`
  no-ops. That's the build warning you keep seeing. Harmless only because nothing queries the
  `stripe.*` tables (entitlement lives in `usersTable`).
- Free deletions: `scripts/package.json:18` declares `stripe-replit-sync` but nothing in `scripts/`
  imports it; `lib/integrations/openai_ai_integrations/` is a duplicate OpenAI layer with no
  `package.json`, so it isn't a workspace package and nothing imports it.

**`replit.md` is wrong on five counts** (docs only): Clerk is stock `@clerk/express`/`@clerk/expo`,
not "Replit-managed"; there's no Stripe connector, no `X-Replit-Token`, no `REPLIT_DEPLOYMENT`
gating; reminders go through Loops, not a Resend connector; the admin digest goes through Loops, not
Gmail. Same fixes needed in `threat_model.md:5,9`, `MEMORY.md:5`, and two `.agents/memory/*.md`
files. `.replit` still lists integrations and carries live price IDs.

Cosmetic only: `@replit/vite-plugin-*` in showcase-video / pitch-deck / mockup-sandbox (none built
by Railway), `ReplitLoadingScene.tsx`, the `REPLIT_*`-reading screenshot scripts.

---

## Also discussed, not started

- **Password-reset email.** Clerk has no admin send-reset API, but the app can send its own:
  `lib/email/transactional.ts` fires Loops events (`welcome`, `account_deleted`), so a
  `password_reset_required` event follows the same pattern and points at the existing "Forgot
  password" flow. Needs the template created in the Loops dashboard or it silently sends nothing.
  Also update the admin copy, which currently promises no email is sent.
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
  Heads-up: committed generated output was built with orval 8.9.1 while the lockfile pins 8.17.0, so
  any regen produces a large formatting diff. `Store.logoUrl` was missing from the spec and only
  survived because the stale generated file still had it — the spec now declares it.
