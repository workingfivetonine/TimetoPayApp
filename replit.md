# Receipt Tracker

A mobile app for scanning receipts with AI, tracking prices over time, and building a smart shopping list.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/scripts run generate-guide` — regenerate the offline how-to guide (MD + PDF) from `@workspace/guide-content`
- `pnpm --filter @workspace/scripts run generate-guide:check` — drift check (`guide-sync` validation): regenerates into a temp dir and fails if the committed guide MD / bundled PDF are stale
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit-provisioned OpenAI integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo SDK 54, React Native, expo-router
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: OpenAI gpt-5.2 vision for receipt parsing
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (stores, items, receipts, lineItems)
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks and Zod schemas (run codegen)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/receipt-tracker/app/` — Expo screens (tabs + scan + receipt/store detail)
- `artifacts/receipt-tracker/components/` — shared UI components
- `artifacts/receipt-tracker/constants/colors.ts` — teal theme color tokens
- `lib/guide-content/src/index.ts` — single source of truth for the how-to guide text (sections, steps, screenshot filenames)
- `scripts/src/generate-guide.ts` — generator that rebuilds the offline guide (MD + PDF) from `@workspace/guide-content`
- `docs/guide/` — generated guide outputs (`Receipt-Tracker-Guide.md`, `.pdf`, `images/`)
- `artifacts/receipt-tracker/assets/guide/Receipt-Tracker-Guide.pdf` — bundled PDF the in-app Help screen downloads (auto-copied by the generator)

## Architecture decisions

- **Web deployment (real website + Expo Go mobile, same artifact)**: the published deployment serves BOTH the actual app in a browser AND the Expo Go mobile distribution. `scripts/build.js` runs `expo export --platform web` (SPA, `app.json` `web.output: "single"`) into `static-build/web/` IN ADDITION TO building the iOS/Android Expo Go bundles + manifests. `server/serve.js` routes by request: Expo Go (requests with `expo-platform: ios|android` header) get the platform manifest JSON; browsers get the real web app (`static-build/web/index.html` with SEO `<title>`/description/OG/Twitter/canonical/robots meta injected at serve time), with static assets resolved from `static-build/web` first then the timestamped Expo Go build, and a SPA fallback (extensionless paths → web index) so deep links like `/catalog` survive reload. `serve.js` also serves `/robots.txt` (Allow: /) and `/sitemap.xml` (Replit injects a `Disallow: /` robots.txt until the app serves its own). If the web build is missing, `serveWebApp` falls back to the old Expo Go QR landing page. Web build gets the same `EXPO_PUBLIC_*` env as the mobile build (domain, Clerk key, repl id). Camera falls back to image picker on web (already handled). **Changes only take effect after REPUBLISH.**
- **Auth**: Replit-managed Clerk. Every user's data is fully private (stores/items/receipts carry a nullable `userId`, scoped per request by `requireAuth`). The very first account ever created becomes the master admin (election in `middlewares/auth.ts`). The app does NOT auto-absorb pre-existing ownerless data into the admin's personal views. Admin gets a read-only cross-user view (`/admin/*`, gated by `requireAdmin`). `GET /me` returns `{id, email, isAdmin, role}` so the client can show/hide admin UI. Expo client uses `@clerk/expo` with bearer tokens (works on web too); `setAuthTokenGetter` attaches the token to every generated API call. Sign-out + user switch clears the React Query cache so data never leaks across accounts. Clerk keys are auto-provisioned (`CLERK_PUBLISHABLE_KEY` → `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in dev script + build.js); never ask the user for them. Self-service password reset lives on the sign-in screen (Clerk Core reset-code flow) — Clerk has no admin backend "send reset email" API, so it's user-initiated.
- **User roles & management**: `usersTable.role` is `master_admin | family | general` (default `general`). `role` mirrors the `isAdmin` power flag (`master_admin` ⇔ `isAdmin`); `family`/`general` are labels only (no data sharing — every user's data stays private). Admin endpoints in `routes/admin.ts`: `PATCH /admin/users/:id/role` (assigning `master_admin` transfers admin in a row-locked txn — demote current, promote target, assert promotion or roll back), `POST /admin/users/merge` (reassign source's stores/items/receipts to target, dedup by normalized name, then delete source + Clerk user), `DELETE /admin/users/:id` (Clerk delete + DB cascade). The single-admin invariant is protected against concurrent races: delete/merge re-check + conditionally delete only when `isAdmin = false` (and merge row-locks the source `FOR UPDATE`), so you can never end up with zero admins.
- **Startup reconciliations** (`lib/bootstrap.ts`, run once per boot, all idempotent/self-disabling): `releaseLegacyAdminData` releases rows the admin owns whose `createdAt` predates the admin's account back to `userId = NULL` (undoes the old auto-claim behavior — they leave personal views but stay in the anonymized global catalog, which ignores `userId`); `reconcileAdminRole` backfills `role='master_admin'` for the existing admin; `ensureAdminExists` re-elects the earliest user if somehow no admin exists.
- Contract-first: all endpoints defined in OpenAPI, hooks/validators auto-generated via Orval
- Numeric DB columns (price, total, deliveryFee) use `numeric`/string in Drizzle and are cast to `Number` in route responses
- Receipt AI parse uses OpenAI vision (`gpt-5.2`) via the Replit-managed `@workspace/integrations-openai-ai-server` lib — no API key needed in app code
- Stores and items are deduplicated by name (case-insensitive) during `parse-and-save`
- Each item has an emoji `icon` (nullable text): AI assigns one per line item at scan time; `iconForItemName(name)` keyword→emoji map (fallback 🛒) sets it on new items and lazily backfills existing items with null icon when re-encountered. Users can override it manually via an emoji picker on the item detail screen.
- Shopping list `isRecurring` flag = `purchaseCount >= 2` (tracked on itemsTable)
- Each item has a `category` (nullable text from a FIXED list in `lib/categories.ts`): AI assigns one per line item at scan time (mirrors the icon flow — set on new items, lazily backfilled on null); admin can correct it via the manage-catalog screen. Canonical catalog items also carry the category
- **Manage-catalog AI assists** (`routes/adminCatalog.ts`, admin-only): `POST /admin/catalog/items/suggest-categories` (body `{ids}`) classifies items via gpt-5.2 **batched** (`CATEGORY_BATCH=150`) so every requested id always gets a suggestion; each result validated against `FIXED_CATEGORIES`, falling back per-item to the `categoryForItemName` heuristic on omit/invalid/AI error. `POST /admin/catalog/items|stores/suggest-duplicates` (no body) ask gpt-5.2 to group same-real-world entities; AI returns nothing on failure (empty `[]`), ids are validated-against-existing + deduped across groups, single-shot capped at `AI_DUPLICATE_LIMIT=400` (one prompt must see all names to group them). `extractJson` tolerates code-fenced/prose-wrapped model output. Suggestions are advisory only — they feed the existing admin-reviewed merge/category UI, never auto-apply.
- **Catalog duplicate auto-suggestions** (`buildSuggestions` in `adminCatalog.ts`): union-find clustering over three signals — exact `looseKey`, token-sort key (word reordering), and Levenshtein similarity ≥0.85 (fuzzy pass gated to n≤800, name len≥4, length-ratio≥0.6 to bound cost). This is the non-AI baseline; the AI assist catches the garbled cases it still misses.
- **Shopping-list membership / dismissal**: an item is shown on the list if it has purchase history OR was explicitly added (`addedToListAt`), AND is not dismissed at/after its most recent event (`dismissedAt >= max(lastPurchased, ranOutAt, addedToListAt)`). `POST /items/:id/dismiss` sets `dismissedAt`; re-adding via catalog refreshes `addedToListAt` and clears `dismissedAt`. The browse endpoint's `inList` flag mirrors this exact logic — keep the two in sync (risk of drift)
- **Browse + add-to-list**: `GET /catalog/browse` (any authed user) returns catalog grouped by category with per-item `inList`; `POST /catalog/add-to-list` matches the user's existing item by ANY normalized alias of the canonical item (via `catalogItemAliasesTable`) to avoid duplicate user rows, then snapshots `globalPrice`/`globalStoreName` onto the item
- **Recommended price/store** (shopping list + PDF): uses the user's OWN purchase history when available, else falls back to the snapshotted global price (`priceSource` = `history` | `global` | `none`); `recommendedPrice`/`recommendedStoreName`/lowest/avg/store are all nullable ("no price yet")
- Camera is only available natively (iOS/Android); web falls back to image picker
- **Offline guide stays in sync with the in-app guide**: the how-to guide text lives ONCE in `@workspace/guide-content` (`GUIDE_SECTIONS` / `GUIDE_ADMIN_SECTIONS`). `app/help.tsx` renders it (mapping `imageFile` → static `require()` in `GUIDE_IMAGES`), and `pnpm --filter @workspace/scripts run generate-guide` rebuilds `docs/guide/Receipt-Tracker-Guide.{md,pdf}` (PDF via `pdfkit`) and copies the PDF into `artifacts/receipt-tracker/assets/guide/`. After editing guide copy or swapping a screenshot in `assets/images/guide/`, rerun the generator so the bundled PDF doesn't drift. The `guide-sync` validation (`generate-guide:check`) regenerates into a temp dir and fails if the committed MD / bundled PDF are stale, so drift is caught before merge. The PDF is made byte-reproducible by pinning a fixed `CreationDate` in the generator. When adding a section, add it to `guide-content` AND add its screenshot key to `GUIDE_IMAGES` (Metro requires static `require()` literals)

## Product

- **List search & sort** (`components/ListControls.tsx`, generic `ListControls<K>` = search `TextInput` + "Sort" pills): every list screen has a search box and sort control. Controls render as a sibling ABOVE the list (never inside `ListHeaderComponent`/`SectionList` header) so the `TextInput` keeps focus on each keystroke. Filter/sort is client-side via `useMemo` over already-fetched data; when a non-empty query yields zero rows each screen shows a query-aware "No matching …" empty state (distinct from the true-empty state). Per screen: Receipts (search store/notes; sort Recent/Price/Store), Stores (name/address; A–Z/Delivery fee, null fees last), Shopping List (name/category; A–Z/Price/Category, shared helper applied to both Regulars + One-offs sections), Admin Global prices (name/store; A–Z/Price/Recent), Admin Manage catalog (canonicalName/category/member names; A–Z/Most used, query resets on items↔stores tab switch). Browse Catalog (`/catalog`) had its own search+sort already and is the styling reference.
- **Receipts tab**: list of all receipts, tap to see line items, edit item names/notes, delete items
- **Scan**: camera viewfinder with AI extraction — point at receipt, tap capture; also supports gallery upload
- **Stores tab**: add/edit stores with delivery fee and minimum order tracking; tap for cost-benefit analysis. Edit modal has a "Delete Store" button (confirmation warns it also removes that store's receipts/line items via DB cascade)
- **Item detail**: "Delete Item" button at bottom (confirmation warns it removes the item from shopping list, price history, and every receipt's line items via cascade); on success navigates back
- **Shopping List tab**: auto-populated from scanned receipts; split into Regulars (2+ purchases) and One-offs; shows lowest price and best store. Header download button exports a printable PDF (via `expo-print` + `expo-sharing`) grouped by store, each with Regulars/One-offs subsections, checkboxes per item, and ran-out items italicized/tagged
- **Analytics tab**: weekly spend bars with HIGH/LOW flags at ±1 std dev; per-item price history (lowest/avg/highest)
- **Browse Catalog** (`/catalog`): available to EVERY user (grid button in Shopping List header). Global price catalog grouped by category (most-recent price per canonical item, aggregated across all users without exposing who bought what). Each row has an add/check button to add the item to the user's shopping list. Items already active on the user's list show as checked; dismissed items show as addable again
- **Admin: Global prices** (`/admin/global`): admin-only cross-user catalog showing the most-recent price per canonical item (overall + per-store, lowest highlighted), aggregated across ALL users without exposing who bought what
- **Admin: Manage catalog** (`/admin/catalog`): admin-only tool to merge/rename/split spelling variants of item and store names into canonical entries. Surfaces auto-suggested merges (names that differ only by case/spaces/punctuation, plus word-reordering and fuzzy near-matches). Never mutates users' private rows — only the catalog mapping layer. Store entries also support an uploaded **logo**: stored as a base64 data URI on `catalogStoresTable.logo`, resized client-side (width 256 PNG via `expo-image-manipulator`) before upload, set/replaced/removed via `PATCH /admin/catalog/stores/:id` (which validates the data-URI MIME + ~1MB cap server-side). Two **AI assists** (gpt-5.2) in the list header: "Suggest categories" classifies every uncategorized item into the fixed category list — each shows as an inline AI pill the admin confirms (✓ → PATCH category) or rejects (✗ → keeps the manual "Set category" picker); "Find duplicates with AI" groups same-real-world entities (catches garbled/variant names exact/fuzzy matching misses) and feeds them into the same admin-reviewed merge flow (never auto-merges)

## Gotchas

- `expo-camera` must be v16.x (compatible with Expo SDK 54) — v56+ breaks with `createPermissionHook` error
- Drizzle `numeric` columns require string values on insert/update; cast to `Number` when returning JSON
- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` to ensure lib declarations are built first
- `EXPO_PUBLIC_DOMAIN` env var is set by the workflow script — used in scan.tsx to construct the API URL

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
