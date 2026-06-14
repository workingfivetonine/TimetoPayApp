import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { boardPostsTable } from "./boardPosts";

export const boardThanksTable = pgTable(
  "board_thanks",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull().references(() => boardPostsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("board_thanks_post_user_idx").on(table.postId, table.userId)],
);

export type BoardThanks = typeof boardThanksTable.$inferSelect;
