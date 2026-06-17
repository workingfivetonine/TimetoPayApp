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
- **Community board** — a moderated tips/deals board for subscribers with 2+ uploaded receipts
- **Profile & onboarding** — unique username + generated avatar, shown as the author on the community board
- **Cross-store catalog** — region-scoped shared item catalog for price benchmarking
- **Subscriptions** — Stripe and PayPal billing with an opt-in free trial, in-app trial-ending and payment-failed banners, and a self-service "manage/cancel" flow
- **Email** — welcome, subscription thank-you, trial-ending, payment past-due, and account-deleted emails (dashboard-editable via Resend templates); all reminders default OFF and carry CAN-SPAM unsubscribe footers
- **Privacy & GDPR** — privacy policy, Terms/Privacy acceptance at signup, full data export, and self-service account + data deletion (cancels billing)
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
| Payments | Stripe + PayPal |
| Email | Resend |
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
│   │       ├── lib/         # Billing, email, AI, analytics
│   │       └── middlewares/ # Auth, rate limiting, entitlement
│   └── receipt-tracker/     # Expo/React Native frontend
│       ├── app/             # Expo Router screens
│       ├── components/      # Shared UI components
│       ├── lib/             # API client, query client
│       └── public/          # Static files (legal pages, PWA assets)
├── lib/
│   ├── db/                  # Drizzle schema and database client
│   ├── api-spec/            # OpenAPI spec
│   ├── api-client-react/    # Generated React Query hooks
│   └── billing/             # Entitlement logic
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
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Monthly subscription price ID |
| `STRIPE_ANNUAL_PRICE_ID` | Annual subscription price ID |
| `STRIPE_ANNUAL_COUPON_ID` | Annual discount coupon ID |
| `PAYPAL_CLIENT_ID` | PayPal app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal app client secret |
| `PAYPAL_API_BASE` | `https://api-m.paypal.com` |
| `PAYPAL_PLAN_ID` | PayPal subscription plan ID |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook ID |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_FROM_EMAIL` | Sending email address |
| `RESEND_FROM_NAME` | Sending name |
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
| `family` | Full complimentary access, no paywall |
| `general` | Standard user, subscription required for premium features |

---

## Key Architecture Notes

- User IDs are Clerk user IDs (text primary key) — not auto-generated integers
- Entitlement is computed server-side from `subscriptionStatus` — never trust client-reported subscription state
- PDF parsing uses `poppler` (`pdftoppm`) for rasterization — must be installed on the server
- Clerk authentication uses a direct CNAME (`clerk.5to9shopping.com`) — no proxy
- All email notifications default to OFF for new users; trial-ending and payment-past-due notices are the exception (always sent, as losing access is critical)
- The web paywall is enforced server-side per feature (`requirePremium` / `allowFreeSingleScan`); native clients are never paywalled (App Store IAP policy)
- The committed API client (`lib/api-client-react`, `lib/api-zod`) is generated but has drifted from the OpenAPI spec — **do not regenerate**. Add new endpoints as raw Express routes called via `fetch`, and read new fields via casts.
- Additive schema changes are applied at server boot via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` in `bootstrap.ts` (no migration step in the deploy)
- Multi-currency is display-only: a country→symbol map in `lib/geo`; amounts are shown as entered and never converted
- The API base URL is pinned in `artifacts/receipt-tracker/vercel.json` (`build.env.EXPO_PUBLIC_API_URL = https://api.5to9shopping.com`). `getApiOrigin()` returns this first, so the generated client can never fall back to `localhost` (it otherwise tried to derive the origin, which fails during Expo's no-`window` static build)

---

## License

Private — FivetoNine LLC. All rights reserved.
