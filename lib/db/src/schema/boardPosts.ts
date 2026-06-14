import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const boardPostsTable = pgTable("board_posts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // "pending" | "approved" | "rejected"
  status: text("status").notNull().default("pending"),
  // "recipe" | "advice" | "cool_idea" | "hot_deal" | "other"
  tag: text("tag"),
  // Human-readable region string derived from user's countryCode+stateCode at post time
  region: text("region"),
  agreeCount: integer("agree_count").notNull().default(0),
  thanksCount: integer("thanks_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
});

export type BoardPost = typeof boardPostsTable.$inferSelect;
