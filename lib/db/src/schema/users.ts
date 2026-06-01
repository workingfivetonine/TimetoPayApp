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
