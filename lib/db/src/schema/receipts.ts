import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";
import { usersTable } from "./users";

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  totalBeforeTax: numeric("total_before_tax", { precision: 10, scale: 2 }),
  // Delivery / service fee charged on the receipt (not a purchased product, so
  // it's kept off the line items). Null = none detected. Feeds the "additional
  // fees" analytics. Visual-only currency, like `total`.
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }),
  // Sales tax / VAT / GST charged on the receipt. Like deliveryFee, it qualifies
  // the total rather than being something purchased, so it stays off the line
  // items. Null = none detected.
  tax: numeric("tax", { precision: 10, scale: 2 }),
  // Total discounts / coupons / loyalty savings, stored as a POSITIVE magnitude
  // (the amount subtracted) so display and summing stay consistent with the
  // other adjustment columns. Null = none detected.
  discount: numeric("discount", { precision: 10, scale: 2 }),
  imageUri: text("image_uri"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
