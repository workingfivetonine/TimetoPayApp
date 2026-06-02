import { pgTable, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    isAdmin: boolean("is_admin").notNull().default(false),
    // User type label. "master_admin" mirrors isAdmin=true (the single elected
    // admin with cross-user powers). "family" and "general" are label-only and
    // carry identical permissions / privacy — no data sharing between users.
    role: text("role").notNull().default("general"),
    // Region for scoping the cross-user catalog the user can see. countryCode is
    // ISO-3166 alpha-2 (uppercase); stateCode is a USPS 2-letter code, only set
    // when countryCode is "US". Null until the user picks a region at first run.
    countryCode: text("country_code"),
    stateCode: text("state_code"),
    // Provider-agnostic subscription state, driven ONLY by verified provider
    // webhooks / provider API reads — never by client-reported success.
    //   subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "none" (null = never subscribed)
    //   subscriptionProvider: "stripe" | "paypal" (null = never subscribed)
    // There is NO automatic trial: a brand-new account starts with no
    // subscription (entitlement status "none"). The free trial is OPT-IN — the
    // user explicitly starts it from the account/paywall screen, which stamps
    // `trialStartedAt`. Entitlement derives the "trialing" window from that
    // timestamp (see lib/billing/entitlement.ts).
    subscriptionStatus: text("subscription_status"),
    subscriptionProvider: text("subscription_provider"),
    subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", {
      withTimezone: true,
    }),
    // When the user opted into the one-time free trial. Null = trial never
    // started (the free-trial offer is still available). Set once and never
    // cleared, so a trial can't be re-claimed after it elapses.
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    // Provider-side identifiers used to reconcile webhook events back to a user.
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    paypalSubscriptionId: text("paypal_subscription_id"),
    // Complimentary access flag set when a user redeems a valid promo code
    // (the "secret override"). When true the user is entitled regardless of
    // subscription state. A deployer-controlled email allowlist
    // (COMP_ACCESS_EMAILS) is a second, env-driven comp mechanism.
    compAccess: boolean("comp_access").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    // DB-enforced single-admin invariant: at most one row may have is_admin = true.
    // Guarantees a deterministic first-admin election even under concurrent first sign-ins.
    uniqueIndex("users_single_admin_idx").on(table.isAdmin).where(sql`${table.isAdmin}`),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
