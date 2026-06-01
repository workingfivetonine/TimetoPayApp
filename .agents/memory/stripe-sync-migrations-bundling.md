---
name: stripe-replit-sync migrations + connector field names
description: Why Stripe tables silently fail to create under esbuild bundling, and the exact connector credential shape.
---

# stripe-replit-sync runtime assets under esbuild

`stripe-replit-sync`'s `runMigrations()` loads its `.sql` files from `path.resolve(__dirname, "./migrations")` at runtime. The api-server is bundled by esbuild into a single `dist/index.mjs` whose banner sets `__dirname` to the bundle's own directory (`dist/`). The package's `migrations/` folder is a runtime asset that esbuild does NOT copy, so the path resolves to `dist/migrations` which doesn't exist.

**The failure is silent**: `connectAndMigrate` does `if (!fs.existsSync(dir)) { log("directory not found, skipping"); return; }` and does NOT throw. So `runMigrations` logs "schema ready" (it only `CREATE SCHEMA IF NOT EXISTS`), but no `stripe.*` tables are created. The first symptom is webhook setup crashing with `relation "stripe.accounts" does not exist`.

**Fix:** `artifacts/api-server/build.mjs` copies the resolved `stripe-replit-sync/.../migrations` dir into `dist/migrations` after the esbuild call.

**Why:** any bundled dependency that reads sibling files via `__dirname` at runtime needs those files copied next to the bundle — bundling only inlines `import`/`require` graph, not fs-read assets.

**How to apply:** when adding a server dependency that ships SQL/templates/protos/etc. it loads by path at runtime, add a copy step in `build.mjs` and verify the asset exists under `dist/` after build.

# Stripe connector credential shape (Replit-managed connector)

The Replit Stripe connection settings expose: `secret` (secret key — NOT `secret_key`), `publishable`, `account_id`, `webhook_secret`, `webhook_id`, `webhook_url`, `mcp`. The connector lookup needs header `X-Replit-Token` (not `X_REPLIT_TOKEN`) and an `environment=development|production` query param chosen by `process.env.REPLIT_DEPLOYMENT === "1"` — dev and prod are separate connections. Mirror any change across both `stripeClient.ts` copies (api-server + `scripts/src`).
