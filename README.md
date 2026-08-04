# TimetoPay

**Scan grocery receipts with AI. Track prices over time. Build a smarter shopping list.**

TimetoPay is a full-stack web app that helps families spend less on groceries by tracking what they pay for items across different stores. Upload a receipt photo or PDF, and AI automatically extracts every item and price. Over time you build a personal price history that shows you the best store and price for everything you buy regularly.

Live at **[5to9shopping.com](https://5to9shopping.com)**

---

## Features

- **AI receipt scanning** — upload a photo or PDF, get items and prices extracted automatically. Free accounts get a limited number of single-photo scans (1/week, 4/month); paid accounts get unlimited scanning plus PDF and multi-receipt uploads.
- **Review before save** — an editable review screen for every scan: fix the store, date, total, and each line item inline, including a per-item "priced by weight" mode (price-per-pound × weight).
- **Price history** — track what you pay for each item across every store over time
- **Smart shopping list** — auto-built from your purchase history, with best-price indicators, "ran out"/"buy more" toggles, undo, and a printable export grouped by category, store, or A–Z
- **Spend analytics** — this-month and since-join spend totals, weekly/monthly trends, and a spend calendar with per-day quick-add
- **Multi-currency display** — prices render in the user's local currency symbol based on their country (visual only — amounts are never converted)
- **Store management** — track multiple stores with delivery fees, hours, website, and Google Maps directions
- **Community board** — a moderated tips/deals board for users with 2+ uploaded receipts
- **Profile & onboarding** — unique username + generated avatar, shown as the author on the community board
- **Cross-store catalog** — region-scoped shared item catalog for price benchmarking
- **Free, with no paid tier** — every feature is available to every signed-in user. Support is an optional donation link; there is no plan, paywall or entitlement check anywhere
- **Email** — welcome, password-reset-required, account-deleted, list-export, receipt-inactivity, shopping-trip and spend-summary emails sent via **Loops** as events (content + automations designed in the Loops dashboard); all reminders default OFF
- **Privacy & GDPR** — privacy policy, Terms/Privacy acceptance at signup, full data export, and self-service account + data deletion
- **PWA support** — installable on mobile home screen, offline-capable

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
│       ├── lib/             # API client, query client
│       └── public/          # Static files (legal pages, PWA assets)
├── lib/
│   ├── db/                  # Drizzle schema and database client
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
| `OPENAI_API_KEY` | OpenAI API key (receipt parsing / catalog AI) |
| `LOOPS_API_KEY` | Loops API key (app.loops.so → Settings → API) |
| `LOOPS_TRANSACTIONAL_SUPPORT_ID` | Loops transactional ID for the support-form relay |
| `LOOPS_TRANSACTIONAL_ADMIN_DIGEST_ID` | Loops transactional ID for the admin digest |
| `ADMIN_EMAIL` | Admin digest recipient |
| `ADMIN_BOOTSTRAP_EMAILS` | Email(s) to auto-promote to master_admin |
| `WEB_BASE_URL` | `https://5to9shopping.com` |
| `NODE_ENV` | `production` |

### Vercel (Frontend)

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://api.5to9shopping.com` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_live_...`) |
| `EXPO_PUBLIC_CLERK_FRONTEND_API_URL` | `https://clerk.5to9shopping.com` |
| `EXPO_PUBLIC_DONATE_URL` | Optional donation page (defaults to the live one) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

---

## Deployment

### Backend (Railway)

- **Root directory:** `/` (repo root)
- **Build command:** `pnpm install --no-frozen-lockfile && pnpm run build`
- **Start command:** `node /app/artifacts/api-server/dist/index.mjs`
- **Watch paths:** `/artifacts/api-server/**`
- System dependency: `poppler_utils` (for PDF rasterization) — configured in `nixpacks.toml`

### Frontend (Vercel)

- **Root directory:** `artifacts/receipt-tracker`
- **Build command:** `pnpm run build`
- **Output directory:** `dist`
- **Install command:** `pnpm install`
- **Framework:** Other

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
- PDF parsing uses `poppler` (`pdftoppm`) for rasterization — must be installed on the server
- Clerk authentication uses a direct CNAME (`clerk.5to9shopping.com`) — no proxy
- All email notifications default to OFF for new users (opt-in), with a 2-day post-signup grace period before any reminder can fire
- The committed API client (`lib/api-client-react`, `lib/api-zod`) is generated from `lib/api-spec/openapi.yaml` via `pnpm --filter @workspace/api-spec run codegen`. Parts of the server have drifted ahead of the spec, so some newer endpoints are raw Express routes called via `fetch` with new fields read through casts — when you regenerate, check the spec covers what the client already relies on.
- Additive schema changes are applied at server boot via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `bootstrap.ts` (no migration step in the deploy)
- Multi-currency is display-only: a country→symbol map in `lib/geo`; amounts are shown as entered and never converted
- The API base URL is pinned in `artifacts/receipt-tracker/vercel.json` (`build.env.EXPO_PUBLIC_API_URL = https://api.5to9shopping.com`). `getApiOrigin()` returns this first, so the generated client can never fall back to `localhost` (it otherwise tried to derive the origin, which fails during Expo's no-`window` static build)

---

## License

Private — FivetoNine LLC. All rights reserved.
