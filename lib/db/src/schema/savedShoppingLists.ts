import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { itemsTable } from "./items";

export const savedShoppingListsTable = pgTable(
  "saved_shopping_lists",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("saved_shopping_lists_user_idx").on(table.userId),
  ],
);

export const savedShoppingListItemsTable = pgTable(
  "saved_shopping_list_items",
  {
    id: serial("id").primaryKey(),
    savedListId: integer("saved_list_id").notNull().references(() => savedShoppingListsTable.id, { onDelete: "cascade" }),
    itemId: integer("item_id").references(() => itemsTable.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    quantity: integer("quantity"),
  },
  (table) => [
    index("saved_shopping_list_items_saved_list_idx").on(table.savedListId),
  ],
);

export type SavedShoppingList = typeof savedShoppingListsTable.$inferSelect;
export type SavedShoppingListItem = typeof savedShoppingListItemsTable.$inferSelect;
