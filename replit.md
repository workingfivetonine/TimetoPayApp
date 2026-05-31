# Receipt Tracker

A mobile app for scanning receipts with AI, tracking prices over time, and building a smart shopping list.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
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

## Architecture decisions

- **Auth**: Replit-managed Clerk. Every user's data is fully private (stores/items/receipts carry a nullable `userId`, scoped per request by `requireAuth`). The very first account ever created becomes admin and claims all pre-existing ownerless rows (one-time backfill in `middlewares/auth.ts`). Admin gets a read-only cross-user view (`/admin/*`, gated by `requireAdmin`). `GET /me` returns `{id, email, isAdmin}` so the client can show/hide admin UI. Expo client uses `@clerk/expo` with bearer tokens (works on web too); `setAuthTokenGetter` attaches the token to every generated API call. Sign-out + user switch clears the React Query cache so data never leaks across accounts. Clerk keys are auto-provisioned (`CLERK_PUBLISHABLE_KEY` → `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in dev script + build.js); never ask the user for them.
- Contract-first: all endpoints defined in OpenAPI, hooks/validators auto-generated via Orval
- Numeric DB columns (price, total, deliveryFee) use `numeric`/string in Drizzle and are cast to `Number` in route responses
- Receipt AI parse uses OpenAI vision (`gpt-5.2`) via the Replit-managed `@workspace/integrations-openai-ai-server` lib — no API key needed in app code
- Stores and items are deduplicated by name (case-insensitive) during `parse-and-save`
- Each item has an emoji `icon` (nullable text): AI assigns one per line item at scan time; `iconForItemName(name)` keyword→emoji map (fallback 🛒) sets it on new items and lazily backfills existing items with null icon when re-encountered. Users can override it manually via an emoji picker on the item detail screen.
- Shopping list `isRecurring` flag = `purchaseCount >= 2` (tracked on itemsTable)
- Camera is only available natively (iOS/Android); web falls back to image picker

## Product

- **Receipts tab**: list of all receipts, tap to see line items, edit item names/notes, delete items
- **Scan**: camera viewfinder with AI extraction — point at receipt, tap capture; also supports gallery upload
- **Stores tab**: add/edit stores with delivery fee and minimum order tracking; tap for cost-benefit analysis. Edit modal has a "Delete Store" button (confirmation warns it also removes that store's receipts/line items via DB cascade)
- **Item detail**: "Delete Item" button at bottom (confirmation warns it removes the item from shopping list, price history, and every receipt's line items via cascade); on success navigates back
- **Shopping List tab**: auto-populated from scanned receipts; split into Regulars (2+ purchases) and One-offs; shows lowest price and best store. Header download button exports a printable PDF (via `expo-print` + `expo-sharing`) grouped by store, each with Regulars/One-offs subsections, checkboxes per item, and ran-out items italicized/tagged
- **Analytics tab**: weekly spend bars with HIGH/LOW flags at ±1 std dev; per-item price history (lowest/avg/highest)

## Gotchas

- `expo-camera` must be v16.x (compatible with Expo SDK 54) — v56+ breaks with `createPermissionHook` error
- Drizzle `numeric` columns require string values on insert/update; cast to `Number` when returning JSON
- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` to ensure lib declarations are built first
- `EXPO_PUBLIC_DOMAIN` env var is set by the workflow script — used in scan.tsx to construct the API URL

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
