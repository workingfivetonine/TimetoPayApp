# TimetoPay

**Scan grocery receipts with AI. Track prices over time. Build a smarter shopping list.**

TimetoPay is a full-stack app — a web app plus iOS and Android builds from the same Expo codebase — that helps families spend less on groceries by tracking what they pay for items across different stores. Upload a receipt photo or PDF, and AI automatically extracts every item and price. Over time you build a personal price history that shows you the best store and price for everything you buy regularly.

Live at **[5to9shopping.com](https://5to9shopping.com)** — current version **2.0.0** (`artifacts/receipt-tracker/app.json`)

---

## Features

- **AI receipt scanning** — upload one photo or several at once, or a PDF of up to 10 pages (a longer file scans the first 10 and warns which pages were skipped). On iOS and Android you can shoot the receipt with the in-app camera, or share one straight into the app from Photos or Files. Nothing is metered — every upload type is available to every signed-in user.
- **Review before save** — an editable review screen for every scan: fix the store (autocompleting against stores you already have), date, total, and each line item inline, including a per-item "priced by weight" mode (price-per-pound × weight). Tap the thumbnail for a full-screen pinch-to-zoom view of the receipt to check the fine print, and "Save & Next" saves and drops you straight into the next scan.
- **Receipt-level adjustments** — delivery fee, tax and discounts are captured as amounts that qualify the total instead of being discarded or mixed in with the line items
- **Batch review** — a multi-page PDF or multi-photo upload lands in one review queue where store names and line items can be fixed in place, and pages belonging to the same receipt can be merged
- **Item matching** — scanned item names are fuzzy-matched against what you've already bought at that store, so an OCR wobble or a spacing change doesn't split one product's price history in two
- **Price history** — track what you pay for each item across every store over time
- **Smart shopping list** — three sub-tabs: **Items** (everything you buy, with best-price indicators, "ran out"/"buy more" toggles and undo), **Create list** (bulk-select what to buy and export a printable list grouped by category, store, or A–Z), and **Shopping** mode (a tick-off view for the trip itself)
- **Spend analytics** — this-month and since-join spend totals, weekly/monthly trends, and a spend calendar with per-day quick-add
- **Multi-currency display** — prices render in the user's local currency symbol based on their country (visual only — amounts are never converted)
- **Store management** — track multiple stores with delivery fees, hours, website, and Google Maps directions; a saved receipt can also be repointed at a different store, suggesting stores you already have
- **Community board** — a moderated tips/deals board for users with 2+ uploaded receipts. Authors can edit and delete their own posts and replies; admins can remove anyone's, inline on the board
- **Profile & onboarding** — unique username + generated avatar, shown as the author on the community board
- **Cross-store catalog** — region-scoped shared item catalog for price benchmarking
- **Admin panel** — users listed by username with email as the secondary line, a per-user account card, and a force-password-reset action (marks the Clerk password compromised and revokes live sessions)
- **Free, with no paid tier** — every feature is available to every signed-in user. Support is an optional donation link; there is no plan, paywall or entitlement check anywhere
- **Email** — nine lifecycle emails through **Loops**, fired as events: `welcome`, `account_deleted`, `password_reset_required`, `preferences_updated`, `trip_receipt_missing`, `list_export_ready`, `receipt_inactivity`, `weekly_summary`, `monthly_summary`. Templates are MJML built from `email-templates/` and uploaded to Loops as zips — see [LOOPS_EMAILS_HTML.md](LOOPS_EMAILS_HTML.md) for branding and upload mechanics, [LOOPS_EMAILS.md](LOOPS_EMAILS.md) for the copy. All reminders default OFF
- **Privacy & GDPR** — privacy policy, Terms/Privacy acceptance at signup, full data export, and self-service account + data deletion
- **PWA + native builds** — installable on the mobile home screen, offline-capable; the same codebase builds iOS and Android apps through EAS

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native / Expo (web export) |
| Backend | Express 5, Node 24, TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Clerk |
| AI | OpenAI (vision model for receipt parsing) |
| Email | Loops (loops.so) |
| Frontend hosting | Vercel |
| Backend hosting | Railway |
| Database hosting | Neon |
| Mobile builds | Expo EAS (iOS + Android) |

---

## Branding

Dark teal, on a navy-purple ground in dark mode. `artifacts/receipt-tracker/constants/colors.ts` is the single source of truth — the app icons, the PWA `theme_color` and the email templates all derive from it.

| Role | Light | Dark |
|---|---|---|
| Primary / tint | `#04576A` | `#4FB3C9` |
| Page background | `#F7F6F9` | `#1C1B30` |
| Card | `#FFFFFF` | `#272643` |
| Savings / good price | `#1E4D40` | `#BBD4CE` (sage) |
| Price spike / destructive | `#C13E77` (magenta) | `#E8709E` |

---

## Project Structure

```
TimetoPayApp/
├── artifacts/
│   ├── api-server/          # Express backend
│   │   └── src/
│   │       ├── routes/      # API route handlers
│   │       ├── lib/         # Email, AI, analytics, notifications
│   │       └── middlewares/ # Auth, rate limiting
│   └── receipt-tracker/     # Expo/React Native frontend
│       ├── app/             # Expo Router screens
│       ├── components/      # Shared UI components
│       ├── constants/       # colors.ts — the palette
│       ├── lib/             # API client, query client
│       └── public/          # Static files (legal pages, PWA assets)
├── email-templates/         # MJML source for the Loops emails + build.mjs
├── lib/
│   ├── db/                  # Drizzle schema and database client
│   ├── geo/                 # Country → region/currency-symbol maps
│   ├── api-spec/            # OpenAPI spec
│   └── api-client-react/    # Generated React Query hooks
└── scripts/                 # Dev and test utilities
```

---

## Environment Variables

### Railway (Backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_live_...`) |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_live_...`) |
| `CLERK_WEBHOOK_SECRET` | Signing secret for the Clerk webhook (user deletions) — the webhook is rejected without it |
| `OPENAI_API_KEY` | OpenAI API key (receipt parsing / catalog AI) |
| `LOOPS_API_KEY` | Loops API key (app.loops.so → Settings → API) |
| `LOOPS_TRANSACTIONAL_SUPPORT_ID` | Loops transactional ID for the support-form relay |
| `LOOPS_TRANSACTIONAL_ADMIN_DIGEST_ID` | Loops transactional ID for the admin digest |
| `EMAIL_UNSUBSCRIBE_SECRET` | Signs one-click unsubscribe links |
| `GOOGLE_MAPS_API_KEY` | Geocoding for store addresses (optional — geocoding is skipped if unset) |
| `ADMIN_BOOTSTRAP_EMAILS` | Email(s) to auto-promote to master_admin. The admin digest goes to the master admin's own email, so there is no separate recipient variable |
| `WEB_BASE_URL` | `https://5to9shopping.com` |
| `PUBLIC_API_BASE_URL` | API origin used in email links (optional — defaults to `https://api.5to9shopping.com`) |
| `NODE_ENV` | `production` |

### Vercel (Frontend)

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://api.5to9shopping.com` (also pinned in `vercel.json`) |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_live_...`) — the Clerk frontend API host is encoded in the key, so no separate URL variable is needed |
| `EXPO_PUBLIC_DONATE_URL` | Optional donation page (defaults to the live one) |
| `EXPO_PUBLIC_DOMAIN` | Domain used in copy/links (defaults to `www.5to9shopping.com`) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

---

## Deployment

### Backend (Railway)

- **Root directory:** `/` (repo root)
- **Builder:** Railpack — build and start commands are committed in `railway.json`
- **Build command:** `pnpm install --no-frozen-lockfile && pnpm run build`
- **Start command:** `node /app/artifacts/api-server/dist/index.mjs`
- **Watch paths:** `/artifacts/api-server/**`
- System dependency: `poppler-utils` (for PDF rasterization) — declared in `railpack.json` under `deploy.aptPackages`. (`nixpacks.toml` is a leftover from the old Nixpacks builder and is no longer what installs it.)

### Frontend (Vercel)

- **Root directory:** `artifacts/receipt-tracker`
- **Framework:** Other
- Install/build/output are all pinned in `artifacts/receipt-tracker/vercel.json`:
  - **Install command:** `NODE_ENV=development pnpm install --shamefully-hoist`
  - **Build command:** `pnpm exec expo export --platform web` (same as the package's `pnpm run build`)
  - **Output directory:** `dist`
  - Rewrites map `/privacy`, `/terms`, `/help`, `/support` and `/donate` to their static pages, everything else to the SPA

### Mobile (Expo EAS)

- Profiles live in `artifacts/receipt-tracker/eas.json`: `development` (dev client, internal), `preview` (internal, Android APK), `production` (auto-incrementing build number)
- `appVersionSource: remote` — EAS owns the build number; the user-facing version comes from `app.json`
- Bundle/package id: `com.fivetonine.timetopay`. iPhone only (`supportsTablet: false`)

### DNS

All DNS is managed through Vercel's DNS panel (Vercel nameservers). Key records:

| Type | Name | Value |
|---|---|---|
| A | @ | Vercel IP |
| CNAME | www | Vercel domain |
| CNAME | api | Railway domain |
| CNAME | clerk | `frontend-api.clerk.services` |

---

## User Roles

| Role | Access |
|---|---|
| `master_admin` | Full access + admin panel, cross-user data |
| `family` | Standard user (label only) |
| `general` | Standard user (label only) |

`family` and `general` are labels with identical permissions — the app is free, so
there is nothing for a role to unlock.

---

## Key Architecture Notes

- User IDs are Clerk user IDs (text primary key) — not auto-generated integers
- PDF parsing uses `poppler` (`pdftoppm`) for rasterization — must be installed on the server. Scans are capped at `PDF_MAX_PAGES` (10) in `artifacts/api-server/src/routes/receipts.ts`; the response returns `pagesSkipped` rather than silently truncating, and the scan screen surfaces it
- Scanned item names fall back to a store-scoped fuzzy match (shared 0.85 similarity threshold) when there's no exact name hit — store-scoped on purpose, so the same generic name at two different shops can't be merged
- Clerk authentication uses a direct CNAME (`clerk.5to9shopping.com`) — no proxy
- All email notifications default to OFF for new users (opt-in), with a 2-day post-signup grace period before any reminder can fire
- The committed API client (`lib/api-client-react`, `lib/api-zod`) is generated from `lib/api-spec/openapi.yaml` via `pnpm --filter @workspace/api-spec run codegen`. Parts of the server have drifted ahead of the spec, so some newer endpoints are raw Express routes called via `fetch` with new fields read through casts — when you regenerate, check the spec covers what the client already relies on.
- Additive schema changes are applied at server boot via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `bootstrap.ts` (no migration step in the deploy)
- Multi-currency is display-only: a country→symbol map in `lib/geo`; amounts are shown as entered and never converted
- The API base URL is pinned in `artifacts/receipt-tracker/vercel.json` (`build.env.EXPO_PUBLIC_API_URL = https://api.5to9shopping.com`). `getApiOrigin()` returns this first, so the generated client can never fall back to `localhost` (it otherwise tried to derive the origin, which fails during Expo's no-`window` static build)

---

## License

Private — FivetoNine LLC. All rights reserved.
