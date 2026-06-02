import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Singleton state for admin notification digests. A single row (id =
// "singleton") tracks the cursor up to which "new things to review" (new catalog
// items / stores / users) have already been reported to the admin, so each
// scheduled digest only reports arrivals since the last successful send.
export const adminNotificationStateTable = pgTable("admin_notification_state", {
  id: text("id").primaryKey().default("singleton"),
  // High-water mark: only rows with createdAt > lastDigestSentAt are "new".
  // Null until the first digest is sent (first run reports everything).
  lastDigestSentAt: timestamp("last_digest_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AdminNotificationState = typeof adminNotificationStateTable.$inferSelect;
