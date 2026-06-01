import { pgTable, serial, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Region scoping for the cross-user catalog. countryCode is ISO-3166 alpha-2
  // (uppercase); stateCode is a USPS 2-letter code, only set when countryCode
  // is "US". Both nullable for legacy rows (backfilled to "US" at startup).
  countryCode: text("country_code"),
  stateCode: text("state_code"),
  address: text("address"),
  phone: text("phone"),
  openTimes: text("open_times"),
  deliveryAvailable: boolean("delivery_available").notNull().default(false),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }),
  minimumOrderAmount: numeric("minimum_order_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
