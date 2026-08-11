import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// A pair of catalog entries an admin has explicitly said do NOT belong
// together, so buildSuggestions() (adminCatalog.ts) stops re-suggesting them.
// Stored per PAIR rather than per suggestion group: a group of 3+ is a
// transitive cluster (A~B, B~C, so A/B/C all group even if A and C aren't
// themselves similar), and the group's exact membership can shift as the
// catalog changes. Dismissing the specific edge between two entries is
// durable to that — it survives a differently-shaped cluster forming around
// either of them later, without silently re-permitting the one connection an
// admin already reviewed and rejected.
export const catalogSuggestionDismissalsTable = pgTable(
  "catalog_suggestion_dismissals",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // "item" | "store"
    // Always stored with idA < idB, so a pair has exactly one row regardless
    // of the order it was dismissed in — lookups don't need to check both ways.
    idA: integer("id_a").notNull(),
    idB: integer("id_b").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("catalog_suggestion_dismissals_pair_idx").on(table.kind, table.idA, table.idB),
  ],
);

export type CatalogSuggestionDismissal = typeof catalogSuggestionDismissalsTable.$inferSelect;
