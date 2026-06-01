---
name: Stripe connector environment selection
description: How the Stripe connector dev vs live connection is chosen, and how to seed the live price from the dev workspace.
---

The Replit Stripe connector exposes two separate connections: `development` (test mode) and `production` (live). `stripeClient.ts` (both the api-server copy and the `scripts/` copy) picks `production` only when `REPLIT_DEPLOYMENT=1`.

**Consequence:** the seed script (`seed-stripe-price`) runs in the dev workspace where `REPLIT_DEPLOYMENT` is unset, so by default it can only ever hit the test-mode connection. There is no interactive deployment shell, so seeding the LIVE price needs an override.

**Override:** `STRIPE_CONNECTOR_ENVIRONMENT=production|development` forces the connection regardless of `REPLIT_DEPLOYMENT`. Going live:
1. Activate a live Stripe account, connect its production connection in Integrations.
2. `STRIPE_CONNECTOR_ENVIRONMENT=production pnpm --filter @workspace/scripts run seed-stripe-price`
3. Set the printed `STRIPE_PRICE_ID` as the **production** secret, then republish.

**Why:** without the override the deployer is stuck — they cannot generate a live price id from the workspace. The webhook is auto-managed per environment by `stripe-replit-sync`, so no manual webhook re-setup is required when switching.

**How to apply:** keep the override logic identical in both `stripeClient.ts` copies (replit.md flags them as must-stay-in-sync).
