import { pgTable, serial, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * A user asking a moderator to look at something.
 *
 * Required for any app with user-generated content (App Store Guideline 1.2):
 * there has to be a way to flag objectionable content, not only for the author
 * to delete their own. Reports never hide anything by themselves — that is a
 * moderator's call — which is why blocking exists separately and takes effect
 * immediately.
 *
 * Exactly one of postId / replyId is set. Both are plain integers rather than
 * foreign keys: a report has to survive the thing it reported being deleted,
 * otherwise the moderation record vanishes at exactly the moment it matters.
 */
export const boardReportsTable = pgTable(
  "board_reports",
  {
    id: serial("id").primaryKey(),
    // Who reported it. Cascades: if they delete their account the report goes
    // with it, since we can no longer answer follow-up questions anyway.
    reporterId: text("reporter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    postId: integer("post_id"),
    replyId: integer("reply_id"),
    // "spam" | "harassment" | "hate" | "sexual" | "off_topic" | "other"
    reason: text("reason").notNull(),
    // Optional free text from the reporter, capped in the route.
    detail: text("detail"),
    // "open" | "actioned" | "dismissed"
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
  },
  (t) => ({
    // One report per person per item. Reporting twice is not a stronger signal,
    // and letting it through would let one user inflate a report count.
    uniquePost: uniqueIndex("board_reports_reporter_post_idx").on(t.reporterId, t.postId),
    uniqueReply: uniqueIndex("board_reports_reporter_reply_idx").on(t.reporterId, t.replyId),
    byStatus: index("board_reports_status_idx").on(t.status, t.createdAt),
  }),
);

export type BoardReport = typeof boardReportsTable.$inferSelect;

/**
 * One user hiding another, for themselves only.
 *
 * Deliberately separate from reporting. A report is a request to a moderator
 * and may take hours; a block is the user's own decision and is instant. Both
 * are required — Apple asks for "a mechanism to block abusive users" alongside
 * the reporting one.
 *
 * Blocks are private: the blocked user is never told, and nothing about their
 * account changes for anyone else.
 */
export const boardBlocksTable = pgTable(
  "board_blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: text("blocker_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unique: uniqueIndex("board_blocks_pair_idx").on(t.blockerId, t.blockedId),
    byBlocker: index("board_blocks_blocker_idx").on(t.blockerId),
  }),
);

export type BoardBlock = typeof boardBlocksTable.$inferSelect;
