# TimetoPay (Receipt Tracker)

A mobile + web app for scanning receipts with AI, tracking prices over time, and
building a smart shopping list. pnpm monorepo: Expo/RN + web client, Express API,
Postgres (Drizzle), Clerk auth. **Every feature is free** — there is no paid tier,
paywall or entitlement check anywhere; support is an optional donation link.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile/web: Expo SDK 54, React Native, expo-router
- API: Express 5; DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: OpenAI `gpt-5.2` vision for receipt parsing (plain `openai` SDK, `OPENAI_API_KEY`)
- Email: Loops (events + transactionals) over plain HTTPS
- API codegen: Orval (from OpenAPI spec); Build: esbuild
- Hosting: Vercel (web), Railway (API), Neon (Postgres)

## Commands

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck (run `typecheck:libs` first if checking api-server alone, so lib declarations build first)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run test` — vitest (needs `DATABASE_URL`; derives a test DB from it)
- `pnpm --filter @workspace/scripts run generate-guide` — regenerate BOTH offline guides (MD + PDF): user how-to + separate admin-only guide
- `pnpm --filter @workspace/scripts run generate-guide:check` — `guide-sync` drift check; fails if any committed guide MD / bundled PDF (user or admin) is stale

## Environment

**Required:** `DATABASE_URL`, `OPENAI_API_KEY`, `CLERK_SECRET_KEY`.
`OPENAI_BASE_URL` is optional and only needed to point at a compatible proxy.
The OpenAI client throws at import if the key is missing — AI parsing is core, so
a missing key stops the boot rather than surfacing as per-request 500s.

**Admin / abuse:**
- `ADMIN_BOOTSTRAP_EMAILS` — allowlist of verified emails permitted to bootstrap/recover master admin. **Unset ⇒ no user is ever auto-promoted (secure default).**
- `AI_GLOBAL_DAILY_MAX` — process-wide daily ceiling on AI receipt-processing requests across ALL users (default `5000`).
- `CATALOG_CONTRIBUTOR_MIN_AGE_DAYS` — tenure gate for catalog contributors (default `7`). **Currently INERT** — only applies under the disabled `minDistinctUsers` suppression (see Catalog privacy); retained for re-enabling without code changes.

**Email (Loops):** `LOOPS_API_KEY`, plus `LOOPS_TRANSACTIONAL_SUPPORT_ID` and
`LOOPS_TRANSACTIONAL_ADMIN_DIGEST_ID` for the two transactionals. Everything else
fires as a Loops **event** — the body is authored in the Loops dashboard against
the event name, so an event whose template doesn't exist yet is a **silent no-op**.
Events fired: `welcome`, `account_deleted`, `password_reset_required`,
`list_export_ready`, `receipt_inactivity`, `trip_receipt_missing`,
`weekly_summary`, `monthly_summary`.

**Client:** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`EXPO_PUBLIC_CLERK_FRONTEND_API_URL`, `EXPO_PUBLIC_DOMAIN`, and optional
`EXPO_PUBLIC_DONATE_URL` (defaults to the live donation page).

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle tables (stores, items, receipts, lineItems, shoppingTrips, etc.)
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks + Zod schemas
- `lib/catalog.ts` — `computeGlobalPrices` (shared global price aggregation)
- `lib/categories.ts` — fixed category list
- `lib/guide-content/src/index.ts` — single source of truth for guide text (user + admin sections, screenshot filenames)
- `lib/integrations-openai-ai-server/` — the OpenAI client (`openai` export) used by every model-backed route
- `scripts/src/generate-guide.ts` — generator that rebuilds both guides (MD + PDF)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/notifications/` — reminder sweep (`reminders.ts`), scheduler, snark copy
- `artifacts/api-server/src/lib/email/` — `loops.ts` (events + transactionals), `transactional.ts` (lifecycle emails), `unsubscribe.ts` (HMAC unsub links)
- `artifacts/api-server/src/lib/analytics/spend.ts` — shared week/month spend aggregation
- `artifacts/api-server/src/lib/textSimilarity.ts` — shared Levenshtein / token-sort / `bestFuzzyMatch`
- `artifacts/api-server/src/lib/currentUser.ts` — `formatCurrentUser` (the `GET /me` shape)
- `artifacts/receipt-tracker/app/` — Expo screens (tabs + scan + receipt/store detail)
- `artifacts/receipt-tracker/components/` — shared UI
- `artifacts/receipt-tracker/constants/colors.ts` — teal theme tokens
- `docs/guide/` — generated guide outputs (user + admin MD/PDF, images)
- `artifacts/receipt-tracker/assets/guide/*.pdf` — bundled PDFs the Help screen downloads (auto-copied by the generator; admin PDF is admin-gated)

## Architecture

### Conventions
- **Contract-first**: all endpoints in OpenAPI; hooks/validators auto-generated via Orval.
- Numeric DB columns (`price`, `total`, `deliveryFee`, `tax`, `discount`) are `numeric`/string in Drizzle; cast to `Number` in responses (and on insert/update they need string values).
- Stores/items deduplicated by case-insensitive name during `parse-and-save`.
- Each item has an emoji `icon` and a `category` (from the fixed list): AI assigns both at scan time, with keyword-heuristic fallback (`iconForItemName` / `categoryForItemName`); both set on new items and lazily backfilled when re-encountered. Users override icon via an emoji picker; admin corrects category in manage-catalog. Canonical catalog items also carry a category.
- Shopping list `isRecurring` = `purchaseCount >= 2`.
- Camera capture is native-only (via `expo-image-picker`'s `launchCameraAsync`); web falls back to the file picker.

### Deployment
- **API** → Railway from `nixpacks.toml`; esbuild bundles to `artifacts/api-server/dist/index.mjs`. `poppler` (`pdftoppm`, `pdfinfo`) must be present on the image — PDF rasterization depends on it.
- **Web** → Vercel from `artifacts/receipt-tracker/`. The API base URL is pinned in `artifacts/receipt-tracker/vercel.json` (`build.env.EXPO_PUBLIC_API_URL`). `getApiOrigin()` returns this first, so the generated client can never fall back to `localhost` (it otherwise tried to derive the origin, which fails during Expo's no-`window` static build).
- **Native** → EAS. `expo-share-intent` is a config plugin, so share-to-app changes need a native rebuild and cannot be tested in Expo Go or on web.
- Additive schema changes are applied at server boot via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `bootstrap.ts`. **Every new column or table must be added there**, or a deploy landing before a manual push 500s — and not only on write: Drizzle emits an explicit column list on SELECT, so a missing column breaks plain reads of the whole table. Column *drops* stay a deliberate manual step (`drizzle-kit push`, or `docs/drop-legacy-billing-columns.sql` for the retired billing set).

### Auth & admin
- Stock Clerk (`@clerk/express` server, `@clerk/expo` client) via a direct CNAME (`clerk.5to9shopping.com`) — no proxy. Every user's data is private (`userId` scoped per request by `requireAuth`). `setAuthTokenGetter` attaches the bearer token to every generated call. Sign-out/user-switch clears the React Query cache.
- **Password reset:** self-service is user-initiated on the sign-in screen. Clerk has no admin "send a reset email" API, but an admin CAN force one: `POST /admin/users/:userId/force-password-reset` calls `clerkClient.users.setPasswordCompromised(userId, { revokeAllSessions: true })`, so Clerk demands a new password at next sign-in. We then send our OWN `password_reset_required` Loops event pointing the user at the self-service flow (it carries no credential and no magic link). No-op for Google-only accounts with no password.
- **Admin is bootstrapped from `ADMIN_BOOTSTRAP_EMAILS`, NOT from being first to sign up.** `ensureUser` (`middlewares/auth.ts`) promotes a brand-new user to master admin only when their **verified** Clerk primary email is allowlisted AND no admin exists (`NOT EXISTS` guard + `users_single_admin_idx` partial unique index as concurrency backstop). No allowlist ⇒ app stays admin-less by design. Admin gets a read-only cross-user view (`/admin/*`, gated by `requireAdmin`). `GET /me` returns `{id, email, isAdmin, role, …}`.
- **Roles**: `usersTable.role` ∈ `master_admin | family | general` (default `general`). `role` mirrors `isAdmin` (`master_admin` ⇔ `isAdmin`); `family`/`general` are labels only — identical permissions, no data sharing, and nothing for a role to unlock. Admin endpoints (`routes/admin.ts`): `PATCH /admin/users/:id/role` (assigning admin transfers it in a row-locked txn), `POST /admin/users/merge` (reassign + dedup + delete source), `DELETE /admin/users/:id` (Clerk + DB cascade). Single-admin invariant is race-protected (conditional delete only when `isAdmin=false`, merge row-locks source `FOR UPDATE`), so you can never reach zero admins.
- **Startup reconciliations** (`lib/bootstrap.ts`, once per boot, idempotent): `releaseLegacyAdminData` releases admin-owned rows predating the admin's account back to `userId=NULL`; `reconcileAdminRole` backfills `role` for the existing admin; `ensureAdminExists` recovers admin ONLY by promoting an allowlisted email (re-validated against Clerk's currently-verified email) when none exists — it never re-elects the earliest user.

### No paid tier
Every data route under `routes/index.ts` is available to any signed-in user.
`lib/billing/`, `middlewares/requireEntitlement.ts`, the Stripe/PayPal webhooks,
`freeScanEvents` and the whole subscription column set are **deleted** — don't
reintroduce an entitlement concept without a product decision. The only money
reference left in the app is the optional donation link on the landing and
account screens (`EXPO_PUBLIC_DONATE_URL`).

### Catalog & privacy
- **`computeGlobalPrices(opts?)`** (`lib/catalog.ts`) is shared by the admin global view (no opts, full visibility) and the all-user browse/add-to-list paths.
- **Contributor threshold DISABLED by product decision**: the former k-anonymity rule (≥3 distinct users before showing a per-store price) is removed — the catalog only ever exposes non-identifying aggregates (canonical item name, store name, a price, a **month-coarsened** date), never an identity or raw row, so a single contributor is treated as non-sensitive. Remaining privacy controls: (1) **region scoping** — browse/add-to-list pass `{countryCode, stateCode}`; region-less requester gets an empty catalog; (2) **own-data exclusion** — pass `excludeUserId`; (3) **month-coarsening** of dates; (4) add-to-list resolves the target id ONLY from the region-scoped result (404 on out-of-region, indistinguishable). The generic `minDistinctUsers` suppression + tenure gate remain in code but **no caller passes them** (inert, re-enableable). `overallLatest*` ordered by (purchasedAt desc, createdAt desc, catalogStoreId asc) for determinism.
- **Browse + add-to-list**: `GET /catalog/browse` returns catalog grouped by category with per-item `inList`; `POST /catalog/add-to-list` matches the user's existing item by ANY normalized alias (`catalogItemAliasesTable`) to avoid dup rows, then snapshots `globalPrice`/`globalStoreName`.
- **Shopping-list membership/dismissal**: shown if it has purchase history OR was explicitly added (`addedToListAt`), AND not dismissed at/after its most recent event (`dismissedAt >= max(lastPurchased, ranOutAt, addedToListAt)`). `POST /items/:id/dismiss` sets `dismissedAt`; re-adding refreshes `addedToListAt` + clears `dismissedAt`. **The browse `inList` flag mirrors this exact logic — keep in sync.**
- **Recommended price/store**: uses the user's OWN history when available, else the snapshotted global price (`priceSource` = `history` | `global` | `none`); all recommended fields nullable.
- **Store website links (affiliate-ready)**: canonical stores carry nullable `websiteUrl`; admin sets/clears via `PATCH /admin/catalog/stores/:id` (`normalizeWebsiteUrl` auto-prefixes `https://`, validates, caps 2048). Store detail shows a tappable row resolved by `lib/storeLink.ts` `resolveStoreLink` — official site when set, else Google-search fallback. This is the single insertion point for a future cashback/affiliate URL.
- **Manage-catalog AI assists** (`routes/adminCatalog.ts`, gpt-5.2, advisory only — never auto-apply): `suggest-categories` (batched `CATEGORY_BATCH=150`, validated against `FIXED_CATEGORIES`, heuristic fallback); `suggest-duplicates` for items/stores (single-shot capped `AI_DUPLICATE_LIMIT=400`, validated + deduped; `extractJson` tolerates fenced output). Non-AI baseline `buildSuggestions`: union-find over exact `looseKey`, token-sort key, and Levenshtein ≥0.85 (fuzzy gated n≤800, len≥4, ratio≥0.6) — shared with scan-time matching via `lib/textSimilarity.ts`.

### Scanning pipeline
- **Per-page model**: `POST /receipts/parse-pdf` renders one page at a time (`renderPdfToImages`, poppler, DPI/width/band-capped), makes one `gpt-5.2` call per page, runs `findDuplicate`, then `persistParsedReceipt` — so **each page becomes its own saved receipt** before the client sees it. Multiple results route to `batch-review`, where the user merges pages that belong to one purchase (`POST /receipts/merge`: earliest-purchased wins, line items reassigned, totals + `tax`/`discount` summed, sources deleted, one transaction with row locks). There is deliberately **no** receipt-boundary heuristic.
- **Page cap**: `PDF_MAX_PAGES = 10`. The true page count is tracked separately from the capped one, and `pagesSkipped` comes back in the response so the client can say pages were dropped instead of truncating silently.
- **Item matching** (`persistParsedReceipt`): exact case-insensitive name first; on a miss, `bestFuzzyMatch` against the user's items previously bought **at that same store** (threshold 0.85) before creating a new item. The threshold is deliberately tight — matching auto-merges with no confirmation, and a wrong merge corrupts price history. Abbreviations and brand synonyms ("CHKN BRST" vs "Chicken Breast", "Coke" vs "Coca Cola") score well below the bar and are NOT caught; that's the intended trade.
- **Receipt-level adjustments**: `tax` and `discount` are receipt columns (positive magnitudes), captured by the prompt as fields and never as line items — same pattern as `deliveryFee`. Editable pre-save in `review-receipt.tsx` and post-save on the detail screen.
- **Store name**: editable pre-save and post-save. `PATCH /receipts/:id/store` repoints ONE receipt at a found-or-created store — deliberately not `PATCH /stores/:id`, which renames the shared row for every receipt on it. `components/StoreNameField.tsx` is the shared autocomplete.
- **Known pre-existing bug:** `chargeGlobalAiBudget` is charged once per *request*, not per page, so a 10-page PDF consumes 1 budget unit while making 10 model calls. Raising the cap from 4 made this 2.5× worse. Not yet fixed.

### Abuse & resource safety
- **AI receipt-processing controls** (`middlewares/aiRateLimit.ts`, `aiAbuseGuard`): every model-backed endpoint wrapped. Image endpoints use `imageGuard` (`imageBase64`, ≤10MB chars); `/receipts/parse-pdf` uses stricter `pdfGuard` (`pdfBase64`, ≤24MB chars). Per user: burst rate limit + rolling 24h quota + concurrency cap; plus process-wide concurrency cap + shared daily budget (`AI_GLOBAL_DAILY_MAX`). Oversized bodies → 413 BEFORE any model/render work; over-limit → 429 + `Retry-After`. State is in-memory (single instance); concurrency released once on response `finish`/`close` + periodic sweep.
- **PDF parse safety**: the page cap is applied to the EXPENSIVE step — `pdfParse(buf,{max:PDF_MAX_PAGES})` bounds extraction, `pdftoppm -f N -l N` limits rasterization per page, plus wall-clock `timeout`+`SIGKILL` (`PDFTOPPM_TIMEOUT_MS`). Downstream `slice(0, PDF_MAX_PAGES)` is defense-in-depth. The global Express body cap (`app.ts`) is kept above `MAX_PDF_B64_CHARS`.

### Notifications
- **Email reminders** (`lib/notifications/`, Loops events): unref'd `setInterval` (`startReminderScheduler`, in-flight guard) runs `runReminderSweep`. **Eligibility:** any user with an email, past a 2-day signup grace. This used to require real billing status, which silently killed every engagement reminder once the app went free — almost nobody reached the per-type checks. Opt-in is still enforced per type, and all three toggles default to **false**.
  - Types: `list_export_ready` (weekly cooldown, non-empty list only — membership mirrors `routes/shoppingList.ts`, keep in sync); `receipt_inactivity` (7+ days, snarky rotating copy in `snark.ts` + a most-overdue-staple jab, re-nudged after a 7-day cooldown); `weekly_summary`/`monthly_summary` (via `lib/analytics/spend.ts`, skipped when both periods are zero).
  - `notifyReceiptReminders` covers two triggers: generic inactivity, and `trip_receipt_missing` — fired a week after a Shopping Mode trip closes with no receipt logged since. The trip-anchored one is tried FIRST and suppresses the inactivity nudge in the same sweep, so a user can't get two near-identical "upload a receipt" emails at once.
  - Trip state lives on `shopping_trips` (`lib/db/src/schema/shoppingTrips.ts`), not a user-level cursor: `reminderSentAt` makes the nudge once-per-trip, so someone shopping weekly gets one nudge per missed trip rather than one per month. Only CLOSED trips are recorded — an abandoned trip never reaches the server and so can never produce a reminder.
  - Cadence: `REMINDER_INTERVAL_MS` (default daily), `REMINDER_INITIAL_DELAY_MS` (default 90s). Cursors only advance on a successful send, so reminders resume once `LOOPS_API_KEY` and the templates exist.
  - **Limitation:** single-instance timer (scale-to-zero may miss a tick, caught up next sweep).
- **Admin review-digest** (`lib/adminDigest.ts`, Loops transactional): the single admin is emailed new `catalog_items`/`catalog_stores`/`users` since the last send. Singleton `admin_notification_state.lastDigestSentAt` is the high-water cursor; window is half-open `(cursor, now]` with `now` from DB (read as text, coerced via `new Date()`). **scheduled** enforces min-gap, skips when empty, and ATOMICALLY CLAIMS the window before sending (`UPDATE ... WHERE last_digest_sent_at IS NOT DISTINCT FROM since`, rolled back if the send throws); **manual** (`POST /admin/review-digest/test`) always sends (even empty), ignores gap, never advances cursor. First tick after boot has a null cursor ⇒ reports all existing data once. Env: `ADMIN_DIGEST_INTERVAL_MS` (default daily), `ADMIN_DIGEST_MIN_GAP_MS` (default 12h, prevents restart-loop spam), `ADMIN_DIGEST_INITIAL_DELAY_MS` (default 60s), `ADMIN_EMAIL`.
- **Offline guide sync** (user + SEPARATE admin guide): guide text lives ONCE in `@workspace/guide-content` as two arrays — `GUIDE_SECTIONS` (user) + `GUIDE_ADMIN_SECTIONS` (admin), each with its own title/tagline/footer. `app/help.tsx` renders user sections to everyone, admin sections + a separate "Download Admin PDF" button ONLY when `/me` `isAdmin`; both map `imageFile` → static `require()` in `GUIDE_IMAGES`. `imageFile` is OPTIONAL (admin text-only sections render without a screenshot). `generate-guide` rebuilds both `docs/guide/*.{md,pdf}` (pdfkit, byte-reproducible via pinned `CreationDate`) and copies both PDFs into `assets/guide/`. **After editing guide copy or a screenshot, rerun the generator** so neither bundled PDF drifts (`generate-guide:check` enforces this). When adding a section: add it to the right array AND (if it has a screenshot) add its key to `GUIDE_IMAGES` (Metro needs static `require()` literals).

### Public landing & SEO
`app/landing.tsx` is a public marketing homepage (web + native) for signed-out
users. `app/_layout.tsx` `InitialLayout` redirects signed-out users on non-public
routes to `/landing` (public = `(auth)` group + `landing`) and bounces signed-in
users off `/landing`/`(auth)` to `/`. `/` renders landing content for signed-out
crawlers and is the single canonical/sitemap URL (`/landing` deliberately not in
the sitemap).

## Product (screens & flows)

- **List search & sort** (`components/ListControls.tsx`): every list screen has a search box + sort pills, rendered as a sibling ABOVE the list (never in `ListHeaderComponent`) so the `TextInput` keeps focus. Client-side `useMemo` filter/sort with query-aware empty states. Per screen — Receipts (store/notes; Recent/Price/Store), Stores (name/address; A–Z/Delivery fee), Shopping List (name/category; A–Z/Price/Category), Admin Global (name/store; A–Z/Price/Recent), Admin Catalog (name/category; A–Z/Most used). Browse Catalog is the styling reference.
- **Receipts tab**: list of receipts → line items; edit names/notes/price/qty/unit, delete with undo.
- **Scan**: Take Photo / Choose from Library on native (web = file picker), plus PDF upload and OS share-to-app. Review shows a zoomable thumbnail (`ZoomableImageModal`, pinch/pan/double-tap) and ends in **Save & Next** (reopens the picker via `/scan?autoOpen=1`) or **Save & Close**.
- **Batch review** (`app/batch-review.tsx`): one card per PDF page, expandable for inline line-item + store-name editing (shared `components/LineItemEditor.tsx`), plus multi-select merge.
- **Stores tab**: add/edit stores with delivery fee + minimum order; cost-benefit analysis; delete (cascades receipts/line items).
- **Item detail**: delete (cascades from shopping list, price history, line items).
- **Shopping List tab**: three sub-tabs behind a segmented control — **Items** (`SectionList` of Regulars / One-offs with lowest price + best store), **Create list** (the former "Download" modal rendered inline: filters, merge suggestions, select/deselect all, custom-item field at the top, PDF + Share export), and **Shopping** (`ShoppingModeView` — only the ticked items, big checkboxes, strike-through, running basket total). Selection state (`excluded`, `customItems`) is **lifted into `shopping.tsx`** — it used to reset on every modal open, which would wipe the selection when switching sub-tabs.
- **Shopping Mode trips**: a trip ends ONLY on the explicit "Done shopping" button — switching sub-tabs isn't leaving the screen, and backgrounding mid-shop is normal, so nothing else may fire a reminder the user didn't earn. Closing POSTs to `/shopping-list/trips` (fire-and-forget) and starts the `trip_receipt_missing` clock. **All** of the shopping screen's working state — `excluded`, `customItems`, `quantities`, `mergedOut`, `nameOverrides` and the basket's `picked` set — is owned by `shopping.tsx`, not the child components: each sub-tab renders in a ternary, so switching tabs UNMOUNTS the other two, and anything held locally is destroyed. `picked` is still not persisted beyond the screen (a stale half-ticked list next trip is worse than starting clean) and is cleared only by "Done shopping".
- **Analytics tab**: weekly spend bars with HIGH/LOW flags (±1 std dev); per-item price history.
- **Onboarding**: sign-up → `region-setup` → app.
- **Browse Catalog** (`/catalog`): global prices grouped by category with add-to-list buttons; checked when already on the list.
- **Account**: profile, region, optional home address (geocoded for store distances), notification toggles, the optional donation card, admin links, contact support, sign out, delete account.
- **Admin: Global prices** (`/admin/global`): cross-user most-recent price per canonical item (overall + per-store, lowest highlighted).
- **Admin: Manage catalog** (`/admin/catalog`): merge/rename/split spelling variants into canonical entries (never mutates private rows). Auto-suggested merges + two gpt-5.2 AI assists ("Suggest categories", "Find duplicates with AI"). Store logos uploaded as resized base64 data URIs (≤~1MB, validated server-side).
- **Admin: Board moderation** (`/admin/board`): approve/reject pending posts; `boardAutoApprove` per user skips the queue.

## Gotchas

- `expo-camera` must be v16.x (Expo SDK 54); v56+ breaks with `createPermissionHook` error.
- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` so lib declarations build first.
- `EXPO_PUBLIC_DOMAIN` is used in `scan.tsx` / `landing.tsx` to construct URLs.
- `expo-share-intent`'s declared type for `androidIntentFilters` is `("text/*" | "image/*" | "video/*" | "*/*")[]`, but we pass `"application/pdf"`. It works (`expo config --type introspect` shows it written into the manifest, and the intent filter is valid Android) but it is **off-contract** — a future plugin version could start validating and silently drop it. The documented-safe alternative is `*/*`, which would put TimetoPay in the share sheet for every file type.
- Reminder emails are only as real as their Loops templates. A new event type with no template in the dashboard is a **silent no-op** — the code is correct and nothing arrives.
- Tests derive a test database from `DATABASE_URL` and fail to even load the vitest config without it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
