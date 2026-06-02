# Receipt Tracker

A mobile + web app for scanning receipts with AI, tracking prices over time, and building a smart shopping list. pnpm monorepo: Expo/RN + web client, Express API, Postgres (Drizzle), Replit-managed Clerk auth, web-only Stripe/PayPal freemium paywall.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile/web: Expo SDK 54, React Native, expo-router
- API: Express 5; DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: OpenAI `gpt-5.2` vision for receipt parsing (Replit-managed integration, no key in app code)
- API codegen: Orval (from OpenAPI spec); Build: esbuild (CJS bundle)

## Commands

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck (run `typecheck:libs` first if checking api-server alone, so lib declarations build first)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run generate-guide` — regenerate BOTH offline guides (MD + PDF): user how-to + separate admin-only guide
- `pnpm --filter @workspace/scripts run generate-guide:check` — `guide-sync` drift check; fails if any committed guide MD / bundled PDF (user or admin) is stale
- `pnpm --filter @workspace/scripts run seed-stripe-price` — idempotently create the $5.99/mo price + annual $71.88/yr price + 20%-off "first year" coupon; prints `STRIPE_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`, `STRIPE_ANNUAL_COUPON_ID`
- `pnpm --filter @workspace/scripts run seed-paypal-plan` — idempotently create the $5.99/mo PayPal plan; prints `PAYPAL_PLAN_ID`

## Environment

**Required:** `DATABASE_URL`; `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit OpenAI integration).

**Admin / abuse:**
- `ADMIN_BOOTSTRAP_EMAILS` — allowlist of verified emails permitted to bootstrap/recover master admin. **Unset ⇒ no user is ever auto-promoted (secure default).**
- `AI_GLOBAL_DAILY_MAX` — process-wide daily ceiling on AI receipt-processing requests across ALL users (default `5000`).
- `CATALOG_CONTRIBUTOR_MIN_AGE_DAYS` — tenure gate for catalog contributors (default `7`). **Currently INERT** — only applies under the disabled `minDistinctUsers` suppression (see Catalog privacy); retained for re-enabling without code changes.

**Billing (web-only paywall):**
- Stripe via Replit **Stripe connector** (no manual key; `stripeClient.ts` fetches via connector proxy). Webhook auto-managed by `stripe-replit-sync` at `/api/stripe/webhook` (raw body parser mounted BEFORE `express.json`).
  - Going live (test→live): connector exposes separate dev/prod connections; `stripeClient.ts` picks prod only when `REPLIT_DEPLOYMENT=1`. To seed the **live** price, override from the dev workspace: `STRIPE_CONNECTOR_ENVIRONMENT=production pnpm --filter @workspace/scripts run seed-stripe-price`, set printed `STRIPE_PRICE_ID` as the production secret, republish. (`STRIPE_CONNECTOR_ENVIRONMENT` accepts `production`|`development`; kept in sync across both `stripeClient.ts` copies.)
  - `STRIPE_PRICE_ID` — monthly price (required for Stripe monthly checkout; has an auto-discovery fallback).
  - `STRIPE_ANNUAL_PRICE_ID` — annual price (required for annual checkout, no fallback). `STRIPE_ANNUAL_COUPON_ID` (optional) — 20%-off "first year" coupon (`duration: once`) applied when `plan:"annual"`. Annual is Stripe-only (PayPal annual → 400).
- PayPal (manual env, no connector): `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PLAN_ID`, `PAYPAL_WEBHOOK_ID` (for signature verification of `/api/webhooks/paypal`). `PAYPAL_API_BASE` **defaults to sandbox** — a LIVE deployment MUST set `https://api-m.paypal.com`.
- `PROMO_CODES` — comma-separated secret codes redeemed via `POST /billing/redeem` → persistent `compAccess` (free full access); constant-time compared.
- `COMP_ACCESS_EMAILS` — email allowlist always granted free access (checked live in `computeEntitlement`).
- If Stripe/PayPal env is unset the app boots fine; only that provider's checkout errors — trials, promo/comp, and the other provider keep working.

**Email reminders (SendGrid connector, optional):** sends 4 reminder types to subscription-related users via **Dynamic Templates** (app sends template id + data only; layout edited in SendGrid dashboard).
- `SENDGRID_FROM_EMAIL` (required to send, verified sender), `SENDGRID_FROM_NAME` (default `Receipt Tracker`).
- Per-type template ids (each optional; missing id ⇒ that email no-ops): `SENDGRID_TEMPLATE_TRIAL_ENDING`, `_PAST_DUE`, `_LIST_EXPORT`, `_RECEIPT_INACTIVITY`, `_WEEKLY_SUMMARY`, `_MONTHLY_SUMMARY`.
- Cadence: `REMINDER_INTERVAL_MS` (default hourly), `REMINDER_INITIAL_DELAY_MS` (default 90s). No-ops if SendGrid unconfigured; per-type cursor only advances on successful send, so reminders resume once configured.

**Admin review-digest email (Gmail connector, optional):** `ADMIN_DIGEST_INTERVAL_MS` (default daily), `ADMIN_DIGEST_MIN_GAP_MS` (default 12h, prevents restart-loop spam), `ADMIN_DIGEST_INITIAL_DELAY_MS` (default 60s). No-ops if Gmail unconnected or no admin email.

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle tables (stores, items, receipts, lineItems, etc.)
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks + Zod schemas
- `lib/catalog.ts` — `computeGlobalPrices` (shared global price aggregation)
- `lib/categories.ts` — fixed category list
- `lib/guide-content/src/index.ts` — single source of truth for guide text (user + admin sections, screenshot filenames)
- `scripts/src/generate-guide.ts` — generator that rebuilds both guides (MD + PDF)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/notifications/` — reminder sweep (`reminders.ts`), scheduler, snark copy
- `artifacts/api-server/src/lib/email/` — `sendgridClient.ts`, `gmailClient.ts` (connector-backed, graceful no-op)
- `artifacts/api-server/src/lib/analytics/spend.ts` — shared week/month spend aggregation
- `artifacts/api-server/src/lib/billing/` — `entitlement.ts`, `stripeSync.ts`, `promo.ts`
- `artifacts/receipt-tracker/app/` — Expo screens (tabs + scan + receipt/store detail)
- `artifacts/receipt-tracker/components/` — shared UI
- `artifacts/receipt-tracker/constants/colors.ts` — teal theme tokens
- `docs/guide/` — generated guide outputs (user + admin MD/PDF, images)
- `artifacts/receipt-tracker/assets/guide/*.pdf` — bundled PDFs the Help screen downloads (auto-copied by the generator; admin PDF is admin-gated)

## Architecture

### Conventions
- **Contract-first**: all endpoints in OpenAPI; hooks/validators auto-generated via Orval.
- Numeric DB columns (`price`, `total`, `deliveryFee`) are `numeric`/string in Drizzle; cast to `Number` in responses (and on insert/update they need string values).
- Stores/items deduplicated by case-insensitive name during `parse-and-save`.
- Each item has an emoji `icon` and a `category` (from the fixed list): AI assigns both at scan time, with keyword-heuristic fallback (`iconForItemName` / `categoryForItemName`); both set on new items and lazily backfilled when re-encountered. Users override icon via an emoji picker; admin corrects category in manage-catalog. Canonical catalog items also carry a category.
- Shopping list `isRecurring` = `purchaseCount >= 2`.
- Camera is native-only (iOS/Android); web falls back to image picker.

### Deployment (web app + Expo Go, same artifact)
The published deployment serves BOTH the browser web app AND the Expo Go mobile distribution. `scripts/build.js` runs `expo export --platform web` (SPA, `web.output:"single"`) into `static-build/web/` plus the iOS/Android bundles + manifests. `server/serve.js` routes by request: Expo Go (header `expo-platform: ios|android`) gets the platform manifest JSON; browsers get the web app with SEO meta injected at serve time, static assets resolved from `static-build/web` first then the Expo Go build, and a SPA fallback for deep links. It also serves `/robots.txt` + `/sitemap.xml`. Web build gets the same `EXPO_PUBLIC_*` env as mobile. **Changes only take effect after REPUBLISH.**

### Auth & admin
- Replit-managed Clerk; every user's data is private (`userId` scoped per request by `requireAuth`). Expo client uses `@clerk/expo` bearer tokens (web too); `setAuthTokenGetter` attaches the token to every generated call. Sign-out/user-switch clears the React Query cache. Clerk keys auto-provisioned (`CLERK_PUBLISHABLE_KEY` → `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) — never ask the user. Self-service password reset is user-initiated on the sign-in screen (Clerk has no admin "send reset email" API).
- **Admin is bootstrapped from `ADMIN_BOOTSTRAP_EMAILS`, NOT from being first to sign up.** `ensureUser` (`middlewares/auth.ts`) promotes a brand-new user to master admin only when their **verified** Clerk primary email is allowlisted AND no admin exists (`NOT EXISTS` guard + `users_single_admin_idx` partial unique index as concurrency backstop). No allowlist ⇒ app stays admin-less by design. Admin gets a read-only cross-user view (`/admin/*`, gated by `requireAdmin`). `GET /me` returns `{id, email, isAdmin, role}`.
- **Roles**: `usersTable.role` ∈ `master_admin | family | general` (default `general`). `role` mirrors `isAdmin` (`master_admin` ⇔ `isAdmin`); `family`/`general` are labels only (no data sharing). Admin endpoints (`routes/admin.ts`): `PATCH /admin/users/:id/role` (assigning admin transfers it in a row-locked txn), `POST /admin/users/merge` (reassign + dedup + delete source), `DELETE /admin/users/:id` (Clerk + DB cascade). Single-admin invariant is race-protected (conditional delete only when `isAdmin=false`, merge row-locks source `FOR UPDATE`), so you can never reach zero admins.
- **Startup reconciliations** (`lib/bootstrap.ts`, once per boot, idempotent): `releaseLegacyAdminData` releases admin-owned rows predating the admin's account back to `userId=NULL`; `reconcileAdminRole` backfills `role` for the existing admin; `ensureAdminExists` recovers admin ONLY by promoting an allowlisted email (re-validated against Clerk's currently-verified email) when none exists — it never re-elects the earliest user.

### Billing & entitlement
- **Freemium, opt-in trial**: signup grants NO subscription (status `none`); free features work, premium surfaces lock. The 30-day trial is **opt-in + one-time** — user taps "Start free trial" → `POST /billing/start-trial`, stamping `users.trialStartedAt` (never cleared) race-safely only when `canStartTrial`. Stripe "Subscribe" checkout sets NO `trial_period_days` (can't stack app trial + provider trial). State stored provider-agnostically on `usersTable` (`subscriptionStatus`/`Provider`/`CurrentPeriodEnd` + provider ids).
- `lib/billing/entitlement.ts` `computeEntitlement(user)` is the **single source of truth**: admins + `compAccess` + `COMP_ACCESS_EMAILS` are always entitled (`comped`); else derives `trialing` (from `trialStartedAt`+`TRIAL_DAYS`, not `createdAt`) / `active` / `past_due` / `canceled` / `none` + `entitled`, plus `canStartTrial`, `showAnnualOffer`. Embedded in `GET /me`. **No backfill** at rollout — mid-trial users drop to `none` and can reclaim the one-time trial with one tap.
- **Premium gate (403)**: only PREMIUM surfaces are gated — (1) AI scanning (`/receipts/detect-bounds|parse|parse-and-save|parse-pdf`), (2) cross-user catalog (`/catalog/browse|add-to-list`), (3) deep per-item price-history (`/analytics/items/:id/price-history`; `/items/:id/history` stays free). `requirePremium` (`middlewares/requireEntitlement.ts`) is applied INLINE per-route (no blanket gate). Denied ⇒ **403** `{error:"premium_required", message:"Subscribe for access to premium AI features", entitlement}`. **Native clients are never paywalled** — `requirePremium` bypasses any request with `x-client-platform: ios|android`. **Documented tradeoff: a web user can spoof that header to dodge the gate** (accepted v1; low-sensitivity data). Quirk: inline middleware widens `req.params.id`, so the price-history route coerces with `parseInt(String(req.params.id))`.
- **Webhook sync**: Stripe → `stripe-replit-sync` (`processStripeWebhook`) at `/api/stripe/webhook`; `mapStripeStatus` normalizes. PayPal → `/api/webhooks/paypal` (public but `verifyPaypalWebhook` does server-side signature check first); approval return lands on `/paywall?paypal=success&subscription_id=…`, client calls `POST /billing/paypal/finalize` which re-fetches the sub server-side before activating.
- **Promo/comp**: `POST /billing/redeem` validates against `PROMO_CODES` (constant-time) → persistent `compAccess`; `COMP_ACCESS_EMAILS` is a live allowlist. Both flow through `computeEntitlement`.

### Catalog & privacy
- **`computeGlobalPrices(opts?)`** (`lib/catalog.ts`) is shared by the admin global view (no opts, full visibility) and the all-user browse/add-to-list paths.
- **Contributor threshold DISABLED by product decision**: the former k-anonymity rule (≥3 distinct users before showing a per-store price) is removed — the catalog only ever exposes non-identifying aggregates (canonical item name, store name, a price, a **month-coarsened** date), never an identity or raw row, so a single contributor is treated as non-sensitive. Remaining privacy controls: (1) **region scoping** — browse/add-to-list pass `{countryCode, stateCode}`; region-less requester gets an empty catalog; (2) **own-data exclusion** — pass `excludeUserId`; (3) **month-coarsening** of dates; (4) add-to-list resolves the target id ONLY from the region-scoped result (404 on out-of-region, indistinguishable). The generic `minDistinctUsers` suppression + tenure gate remain in code but **no caller passes them** (inert, re-enableable). `overallLatest*` ordered by (purchasedAt desc, createdAt desc, catalogStoreId asc) for determinism.
- **Browse + add-to-list**: `GET /catalog/browse` returns catalog grouped by category with per-item `inList`; `POST /catalog/add-to-list` matches the user's existing item by ANY normalized alias (`catalogItemAliasesTable`) to avoid dup rows, then snapshots `globalPrice`/`globalStoreName`.
- **Shopping-list membership/dismissal**: shown if it has purchase history OR was explicitly added (`addedToListAt`), AND not dismissed at/after its most recent event (`dismissedAt >= max(lastPurchased, ranOutAt, addedToListAt)`). `POST /items/:id/dismiss` sets `dismissedAt`; re-adding refreshes `addedToListAt` + clears `dismissedAt`. **The browse `inList` flag mirrors this exact logic — keep in sync.**
- **Recommended price/store**: uses the user's OWN history when available, else the snapshotted global price (`priceSource` = `history` | `global` | `none`); all recommended fields nullable.
- **Store website links (affiliate-ready)**: canonical stores carry nullable `websiteUrl`; admin sets/clears via `PATCH /admin/catalog/stores/:id` (`normalizeWebsiteUrl` auto-prefixes `https://`, validates, caps 2048). Store detail shows a tappable row resolved by `lib/storeLink.ts` `resolveStoreLink` — official site when set, else Google-search fallback. This is the single insertion point for a future cashback/affiliate URL.
- **Manage-catalog AI assists** (`routes/adminCatalog.ts`, gpt-5.2, advisory only — never auto-apply): `suggest-categories` (batched `CATEGORY_BATCH=150`, validated against `FIXED_CATEGORIES`, heuristic fallback); `suggest-duplicates` for items/stores (single-shot capped `AI_DUPLICATE_LIMIT=400`, validated + deduped; `extractJson` tolerates fenced output). Non-AI baseline `buildSuggestions`: union-find over exact `looseKey`, token-sort key, and Levenshtein ≥0.85 (fuzzy gated n≤800, len≥4, ratio≥0.6).

### Abuse & resource safety
- **AI receipt-processing controls** (`middlewares/aiRateLimit.ts`, `aiAbuseGuard`): every model-backed endpoint wrapped. Image endpoints use `imageGuard` (`imageBase64`, ≤10MB chars); `/receipts/parse-pdf` uses stricter `pdfGuard` (`pdfBase64`, ≤15MB chars). Per user: burst rate limit + rolling 24h quota + concurrency cap; plus process-wide concurrency cap + shared daily budget (`AI_GLOBAL_DAILY_MAX`). Oversized bodies → 413 BEFORE any model/render work; over-limit → 429 + `Retry-After`. State is in-memory (single instance); concurrency released once on response `finish`/`close` + periodic sweep.
- **PDF parse safety** (`/receipts/parse-pdf`): 4-page cap applied to the EXPENSIVE step — `pdfParse(buf,{max:PDF_MAX_PAGES})` bounds extraction, `pdftoppm -f 1 -l PDF_MAX_PAGES` limits rasterization, plus wall-clock `timeout`+`SIGKILL`. Downstream `slice(0, PDF_MAX_PAGES)` is defense-in-depth.

### Notifications
- **Email reminders** (`lib/notifications/`, SendGrid Dynamic Templates): unref'd hourly `setInterval` (`startReminderScheduler`, in-flight guard) runs `runReminderSweep`, keeping only subscription-related users (`entitled` OR raw `past_due`). Four opt-out toggle types: (1) **payment** — trial-ending within 3 days (once) + past-due once per episode (cursor cleared when status leaves `past_due`); (2) **list-export nudge** — weekly cooldown, non-empty list only (membership mirrors `routes/shoppingList.ts` — keep in sync); (3) **receipt-inactivity** — 7+ days, snarky rotating copy (`snark.ts`) + a most-overdue-staple jab, re-nudged after 7-day cooldown; (4) **spend summaries** — end-of-week / end-of-month recaps via `lib/analytics/spend.ts`, skipped when both periods zero. Engagement reminders (2–4) only for entitled users; a grace-elapsed past_due user gets only payment. A no-op send (unconfigured) does NOT advance the per-type cursor. Toggles via `GET`/`PATCH /me/notifications`. **Limitation:** single-instance timer (scale-to-zero may miss a tick, caught up next sweep).
- **Admin review-digest** (`lib/adminDigest.ts`, Gmail connector): the single admin is emailed new `catalog_items`/`catalog_stores`/`users` since the last send. Singleton `admin_notification_state.lastDigestSentAt` is the high-water cursor; window is half-open `(cursor, now]` with `now` from DB (read as text, coerced via `new Date()`). **scheduled** enforces min-gap, skips when empty, and ATOMICALLY CLAIMS the window before sending (`UPDATE ... WHERE last_digest_sent_at IS NOT DISTINCT FROM since`, rolled back if Gmail throws); **manual** (`POST /admin/review-digest/test`) always sends (even empty), ignores gap, never advances cursor. First tick after boot has null cursor ⇒ reports all existing data once. Single-instance timer; scale-to-zero may miss ticks (acceptable).
- **Offline guide sync** (user + SEPARATE admin guide): guide text lives ONCE in `@workspace/guide-content` as two arrays — `GUIDE_SECTIONS` (user) + `GUIDE_ADMIN_SECTIONS` (admin), each with its own title/tagline/footer. `app/help.tsx` renders user sections to everyone, admin sections + a separate "Download Admin PDF" button ONLY when `/me` `isAdmin`; both map `imageFile` → static `require()` in `GUIDE_IMAGES`. `imageFile` is OPTIONAL (admin text-only sections render without a screenshot; only `admin-catalog.jpg`/`admin-global.jpg` exist). `generate-guide` rebuilds both `docs/guide/*.{md,pdf}` (pdfkit, byte-reproducible via pinned `CreationDate`) and copies both PDFs into `assets/guide/`. **After editing guide copy or a screenshot, rerun the generator** so neither bundled PDF drifts (`generate-guide:check` enforces this). When adding a section: add it to the right array AND (if it has a screenshot) add its key to `GUIDE_IMAGES` (Metro needs static `require()` literals).

### Public landing & SEO
`app/landing.tsx` is a public marketing homepage (web + native) for signed-out users. `app/_layout.tsx` `InitialLayout` redirects signed-out users on non-public routes to `/landing` (public = `(auth)` group + `landing`) and bounces signed-in users off `/landing`/`(auth)` to `/`. `/` renders landing content for signed-out crawlers and is the single canonical/sitemap URL (`/landing` deliberately not in the sitemap). Marketing copy/SEO strings live in `landing.tsx` + `server/serve.js` `buildSeoHead` — keep roughly aligned. **Takes effect after REPUBLISH.**

## Product (screens & flows)

- **List search & sort** (`components/ListControls.tsx`): every list screen has a search box + sort pills, rendered as a sibling ABOVE the list (never in `ListHeaderComponent`) so the `TextInput` keeps focus. Client-side `useMemo` filter/sort with query-aware empty states. Per screen — Receipts (store/notes; Recent/Price/Store), Stores (name/address; A–Z/Delivery fee), Shopping List (name/category; A–Z/Price/Category), Admin Global (name/store; A–Z/Price/Recent), Admin Catalog (name/category; A–Z/Most used). Browse Catalog is the styling reference.
- **Receipts tab**: list of receipts → line items; edit names/notes, delete items.
- **Scan**: camera viewfinder with AI extraction + gallery upload (native camera only; web = image picker).
- **Stores tab**: add/edit stores with delivery fee + minimum order; cost-benefit analysis; delete (cascades receipts/line items).
- **Item detail**: delete (cascades from shopping list, price history, line items).
- **Shopping List tab**: auto-populated; split into Regulars (2+ purchases) + One-offs; shows lowest price + best store. Header exports a printable PDF (`expo-print` + `expo-sharing`) grouped by store with checkboxes.
- **Analytics tab**: weekly spend bars with HIGH/LOW flags (±1 std dev); per-item price history (free Calendar/weekly; premium Items tab).
- **Onboarding**: sign-up → `region-setup` → `choose-plan` → app. `choose-plan.tsx` offers Start free trial / Pay with card / Pay with PayPal / Continue free; any choice calls `POST /billing/plan-selected` (stamps `planSelectedAt`, race-safe, idempotent). Checkout marks plan-selected BEFORE redirecting so abandonment doesn't loop. No backfill.
- **Annual offer** (`components/AnnualOfferModal.tsx`, web only): one-time 20%-off modal shown to free users AFTER their trial ended (`showAnnualOffer` server-computed); suppressed on landing/pricing/auth/region/choose-plan/paywall. "Get 20% off" → annual Stripe checkout; "No thanks" → `POST /billing/dismiss-annual-offer` (never returns).
- **Paywall** (`app/paywall.tsx`, web only): NOT a forced redirect under freemium — reached on demand from an upsell or Account "Subscribe". Shows $5.99/mo plan, Stripe/PayPal buttons, promo-code field, sign-out; handles PayPal return.
- **Premium upsell** (`hooks/usePremiumLock.ts` + `components/PremiumUpsell.tsx`): `locked` = web AND `/me` loaded AND not entitled. Locked surfaces: scan (swaps AI buttons for Subscribe CTA, maps 403 to upgrade prompt), catalog (disables query when locked), analytics Items tab.
- **Account: Subscription** (`app/account.tsx`, web only): live status card (default "No subscription"); actions Manage (billing portal) / Start free trial (when `canStartTrial`) / Subscribe.
- **Browse Catalog** (`/catalog`): available to every user; global prices grouped by category with add-to-list buttons; checked when already on the list.
- **Admin: Global prices** (`/admin/global`): cross-user most-recent price per canonical item (overall + per-store, lowest highlighted).
- **Admin: Manage catalog** (`/admin/catalog`): merge/rename/split spelling variants into canonical entries (never mutates private rows). Auto-suggested merges + two gpt-5.2 AI assists ("Suggest categories", "Find duplicates with AI"). Store logos uploaded as resized base64 data URIs (≤~1MB, validated server-side).

## Gotchas

- `expo-camera` must be v16.x (Expo SDK 54); v56+ breaks with `createPermissionHook` error.
- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` so lib declarations build first.
- `EXPO_PUBLIC_DOMAIN` is set by the workflow script — used in `scan.tsx` to construct the API URL.
- Stripe connector exposes the secret key as `settings.secret` (NOT `secret_key`), needs the `X-Replit-Token` header + `environment=development|production` query param (keyed off `REPLIT_DEPLOYMENT`).
- `stripe-replit-sync`'s `runMigrations()` resolves SQL relative to `__dirname`; since api-server is esbuild-bundled to `dist/index.mjs`, `build.mjs` must copy `migrations/` into `dist/migrations` — else the migration silently skips and `stripe.*` tables never create.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
