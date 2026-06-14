import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { boardPostsTable } from "./boardPosts";

export const boardRepliesTable = pgTable("board_replies", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => boardPostsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // "pending" | "approved" | "rejected"
  status: text("status").notNull().default("pending"),
  region: text("region"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
});

export type BoardReply = typeof boardRepliesTable.$inferSelect;
