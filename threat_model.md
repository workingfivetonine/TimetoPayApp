# Threat Model

## Project Overview

Receipt Tracker is a public, production-deployed Expo/React Native + web application backed by an Express API and PostgreSQL. Auth uses Replit-managed Clerk. Core user data includes receipts, line items, stores, shopping lists, and per-user analytics. The API also exposes admin-only cross-user catalog and user-management features, plus AI-backed receipt parsing that sends uploaded receipt images/PDFs to OpenAI and, for scanned PDFs, local PDF rendering tools.

Production assumptions for this repo:
- `NODE_ENV=production` in deployed environments.
- Replit provides TLS for deployed traffic.
- `artifacts/mockup-sandbox/` is dev-only and should be ignored unless separately proven production-reachable.
- This deployment is public, so internet users can reach public pages and any API path that does not require auth.

## Assets

- **User accounts and sessions** — Clerk identities, bearer tokens, and the local `users` table. Compromise enables access to private receipts, stores, analytics, and shopping lists.
- **Private shopping history** — receipts, line items, item names, store names, prices, notes, and timestamps. This is the app’s primary sensitive data.
- **Administrative authority** — the single `master_admin` role can list users, inspect cross-user receipts, merge or delete users, and manage the global catalog.
- **Global catalog data** — canonicalized cross-user item/store names, global price snapshots, and store logos. Even when intended to be aggregated, it is derived from private user activity and can still leak sensitive information if exposed too precisely.
- **Application spend and compute capacity** — OpenAI-backed parsing and local PDF conversion are billable and CPU-intensive. Abuse can create financial loss and degrade availability.
- **Application secrets** — database credentials, Clerk secret key, and OpenAI integration credentials held in environment variables.

## Trust Boundaries

- **Client ↔ API** — browsers and mobile clients are untrusted. All request bodies, params, and headers must be treated as attacker-controlled.
- **API ↔ Clerk** — the server relies on Clerk-authenticated identity and proxies Clerk frontend API traffic in production.
- **API ↔ PostgreSQL** — the API has broad database authority. Route-level authorization mistakes can expose or corrupt all user data.
- **API ↔ OpenAI / local PDF tooling** — receipt parsing sends user-controlled content to an external model and, for PDFs, through local parsing/rendering tools. This is the highest-cost and highest-abuse processing boundary.
- **Authenticated user ↔ admin** — authenticated users should only access their own data; admin routes are a separate privilege boundary with cross-user visibility and destructive actions.
- **Per-user private data ↔ global catalog** — global catalog and price aggregation intentionally derive from many users’ data. This boundary must preserve privacy despite aggregation.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/receipt-tracker/server/serve.js`, `artifacts/receipt-tracker/app/**`.
- **Highest-risk server code:** `artifacts/api-server/src/middlewares/auth.ts`, `artifacts/api-server/src/lib/bootstrap.ts`, `artifacts/api-server/src/routes/receipts.ts`, `artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/src/routes/adminCatalog.ts`, `artifacts/api-server/src/lib/catalog.ts`.
- **Public vs authenticated vs admin:** `/api/health` is public; nearly all `/api/*` routes require auth; `/api/admin/*` and `/api/admin/catalog/*` require admin.
- **Usually dev-only:** `artifacts/mockup-sandbox/**`, build scripts, generated client code, and local tooling unless directly invoked by production request paths.

## Threat Categories

### Spoofing

The application trusts Clerk for identity, so protected API routes must continue to reject requests without a valid Clerk-authenticated user and must not derive privilege from client-controlled fields. The system also needs a safe bootstrap story for the initial admin, because the first account election is part of the authentication/identity trust boundary in this repo.

Required guarantees:
- Protected API routes MUST require a valid Clerk-authenticated user on the server.
- Administrative authority MUST be assigned through a trusted bootstrap mechanism, not simply to whichever user arrives first on a public deployment.
- Clerk proxy behavior MUST not let client-controlled host/header data weaken auth decisions.

### Tampering

Users can submit receipt images, PDFs, manual receipt data, notes, store names, and item names. Admins can merge catalog entries and upload logos. The server must treat all of that input as untrusted, validate it, and ensure client input cannot corrupt other users’ data or bypass catalog/admin invariants.

Required guarantees:
- User-controlled receipt/store/item fields MUST only modify rows owned by the authenticated user unless an admin route explicitly allows broader action.
- Admin merge/split/update routes MUST keep alias/canonical mappings consistent and scoped to authorized admins.
- AI-derived parsed receipt content MUST be validated before persistence and MUST NOT be trusted as if it were authoritative input.

### Information Disclosure

User shopping history is private by default, but the product also exposes cross-user aggregated catalog data and admin read-only views. The main privacy risk is any route that accidentally exposes another user’s raw data, or aggregation that is precise enough to reveal an individual user’s purchases.

Required guarantees:
- Non-admin routes MUST return only the authenticated user’s receipts, items, stores, analytics, and shopping-list data.
- Admin-only cross-user routes MUST remain server-side gated.
- Aggregated catalog features MUST avoid exposing singleton or near-singleton user activity in a way that defeats the app’s privacy promise.
- Aggregated catalog privacy controls MUST not rely solely on raw account counts in a self-service signup environment, because attacker-created accounts can be used to steer or defeat naive k-anonymity thresholds.
- Logs and errors MUST not leak secrets, tokens, or raw sensitive payloads.

### Denial of Service

Receipt parsing is the most important availability risk. Authenticated users can submit large base64 images and PDFs, trigger model calls, and force local PDF parsing/rendering work. On a public deployment, abuse by throwaway accounts can translate directly into cloud spend and service instability.

Required guarantees:
- Expensive AI-backed receipt and catalog-assist endpoints MUST have rate limits, quotas, or equivalent abuse controls.
- Shared AI budgets and quotas MUST not be consumed by requests that have not yet passed required-field validation, or attackers can turn the quota itself into a cheap denial-of-service primitive.
- Uploaded image/PDF payloads MUST have enforceable size and complexity limits appropriate for model and PDF-processing paths.
- External/model calls and local PDF tooling MUST fail safely without allowing one user to monopolize resources.

### Elevation of Privilege

The admin boundary is central to this application because admin users can inspect or mutate cross-user state. Any flaw in admin bootstrap, route gating, or role transfer logic becomes a whole-application compromise.

Required guarantees:
- Only trusted, explicitly designated users MUST receive `master_admin` privileges.
- Admin-only routes MUST rely on server-side authorization checks, never client UI hiding.
- Recovery logic for “no admin exists” MUST not let an attacker on a public deployment seize admin privileges simply by being first or earliest.
