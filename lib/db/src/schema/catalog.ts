import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// Admin-only global catalog layer. These tables NEVER reference or mutate a
// user's private stores/items/receipts/line_items. They map normalized
// per-user names onto canonical entries so the admin can view prices across
// all users and merge spelling variants — without ever touching user data.

export const catalogStoresTable = pgTable("catalog_stores", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogStoreAliasesTable = pgTable("catalog_store_aliases", {
  id: serial("id").primaryKey(),
  // Normalized (lower(btrim(name))) store name. One alias per distinct name.
  normalizedName: text("normalized_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  catalogStoreId: integer("catalog_store_id")
    .notNull()
    .references(() => catalogStoresTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogItemsTable = pgTable("catalog_items", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  icon: text("icon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogItemAliasesTable = pgTable("catalog_item_aliases", {
  id: serial("id").primaryKey(),
  // Normalized (lower(btrim(name))) item name. One alias per distinct name.
  normalizedName: text("normalized_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => catalogItemsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CatalogStore = typeof catalogStoresTable.$inferSelect;
export type CatalogStoreAlias = typeof catalogStoreAliasesTable.$inferSelect;
export type CatalogItem = typeof catalogItemsTable.$inferSelect;
export type CatalogItemAlias = typeof catalogItemAliasesTable.$inferSelect;
