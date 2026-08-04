import { pgTable, text, boolean, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
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
    // ── Public profile (set during post-signup onboarding) ─────────────────
    // username is the public handle shown as the author on community posts;
    // uniqueness is enforced case-insensitively (functional unique index created
    // in bootstrap.ensureSchemaColumns). firstName/lastName are optional + private.
    // avatar is a generated avatar URL (DiceBear).
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatar: text("avatar"),
    // Optional home/mailing address. When set, it's geocoded (Google) to
    // latitude/longitude so the Stores list can show "distance from" each store.
    // Private; never shown to other users.
    address: text("address"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    // ── Email reminder notification preferences (opt-in toggles) ───────────
    // Independent on/off switches for the reminder emails. Default OFF (opt-in):
    // new users receive no reminder emails until they enable them from the
    // account screen. TimetoPay is free, so these are the only emails that need
    // a preference — there is no billing to notify anyone about.
    //   notifyListExport:       weekly grocery-list export nudge
    //   notifyReceiptReminders: "upload a receipt" inactivity nudge
    //   notifySpendSummary:     end-of-week / end-of-month spend recaps
    notifyListExport: boolean("notify_list_export").notNull().default(false),
    notifyReceiptReminders: boolean("notify_receipt_reminders").notNull().default(false),
    notifySpendSummary: boolean("notify_spend_summary").notNull().default(false),
    // ── Per-type notification frequency (weekly | monthly) ─────────────────
    notifyListExportFrequency: text("notify_list_export_frequency").default("weekly"),
    notifyReceiptRemindersFrequency: text("notify_receipt_reminders_frequency").default("weekly"),
    notifySpendSummaryFrequency: text("notify_spend_summary_frequency").default("weekly"),
    // ── Per-email-type "last sent" cursors (dedupe / once-per-period) ──────
    // The scheduler records when each email type was last sent to this user so a
    // reminder fires at most once per relevant period across repeated runs.
    lastWeeklySummarySentAt: timestamp("last_weekly_summary_sent_at", { withTimezone: false }),
    lastMonthlySummarySentAt: timestamp("last_monthly_summary_sent_at", { withTimezone: false }),
    lastListExportSentAt: timestamp("last_list_export_sent_at", { withTimezone: true }),
    lastReceiptInactivitySentAt: timestamp("last_receipt_inactivity_sent_at", { withTimezone: true }),
    // Debounce for the "email preferences updated" confirmation — coalesces a
    // burst of per-toggle saves into a single email.
    lastPrefsEmailSentAt: timestamp("last_prefs_email_sent_at", { withTimezone: true }),
    // When the user last viewed the community board — used to compute the unread count badge.
    boardLastSeenAt: timestamp("board_last_seen_at", { withTimezone: true }),
    // Trusted community poster: when true, this user's board posts and replies go
    // live immediately, skipping the pending-approval queue. Set by an admin from
    // the user's admin detail screen. Default false = everything is reviewed first.
    boardAutoApprove: boolean("board_auto_approve").notNull().default(false),
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
