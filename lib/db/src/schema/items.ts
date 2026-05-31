import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),
  // Fixed-list category (see api-server lib/categories). AI-assigned at scan time.
  category: text("category"),
  notes: text("notes"),
  purchaseCount: integer("purchase_count").notNull().default(0),
  ranOutAt: timestamp("ran_out_at", { withTimezone: true }),
  // Shopping-list membership: set when the item is explicitly added (e.g. from
  // the global catalog). Lets items with no purchase history show on the list.
  addedToListAt: timestamp("added_to_list_at", { withTimezone: true }),
  // Set when the user removes the item from the list. The item reappears once a
  // newer purchase / ran-out / re-add event happens after this timestamp.
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  // Snapshot of the global catalog price/store at add time, for items the user
  // adds from the global database before they have any personal purchase history.
  globalPrice: numeric("global_price"),
  globalStoreName: text("global_store_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
