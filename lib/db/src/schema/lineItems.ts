import { pgTable, serial, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { receiptsTable } from "./receipts";
import { itemsTable } from "./items";

export const lineItemsTable = pgTable("line_items", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => receiptsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => itemsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLineItemSchema = createInsertSchema(lineItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type LineItem = typeof lineItemsTable.$inferSelect;
