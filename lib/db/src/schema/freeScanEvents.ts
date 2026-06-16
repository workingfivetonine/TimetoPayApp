import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per AI receipt scan a FREE (non-entitled) user performs. Used to
// enforce the free-tier limits (1 per rolling week, 4 per rolling month).
// Entitled/native/admin scans are never recorded here.
export const freeScanEventsTable = pgTable(
  "free_scan_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("free_scan_events_user_created_idx").on(table.userId, table.createdAt)],
);

export type FreeScanEvent = typeof freeScanEventsTable.$inferSelect;
