import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per finished shopping trip, written when the user taps "Done shopping"
// in Shopping Mode. Exists so the receipt-upload reminder can be anchored to the
// trip rather than to general inactivity: "you shopped on Tuesday and there's
// still no receipt" is a far better nudge than "you haven't scanned in a while".
//
// Only CLOSED trips are recorded — the client tracks an in-progress trip locally
// and only tells the server once it ends, so an abandoned trip never becomes a
// reminder. There is deliberately no "open trip" state here.
export const shoppingTripsTable = pgTable(
  "shopping_trips",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // When the user finished shopping. The reminder clock runs from here.
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
    // How many of the selected items were actually ticked off, kept purely so the
    // reminder email and any future history view can say something specific.
    itemsPicked: integer("items_picked").notNull().default(0),
    itemsPlanned: integer("items_planned").notNull().default(0),
    // Set once a receipt has been logged for this trip, which is what stops the
    // reminder. Nullable: null means "still waiting on a receipt".
    receiptLoggedAt: timestamp("receipt_logged_at", { withTimezone: true }),
    // Set when the week-later nudge goes out, so it can only ever fire once per
    // trip regardless of how often the sweep runs.
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The sweep's access pattern: find this user's trips still awaiting a receipt,
    // oldest first.
    index("shopping_trips_user_closed_idx").on(table.userId, table.closedAt),
  ],
);

export type ShoppingTrip = typeof shoppingTripsTable.$inferSelect;
