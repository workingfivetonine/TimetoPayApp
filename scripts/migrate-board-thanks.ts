/**
 * Migration: add thanks_count to board_posts, create board_thanks table
 *
 * Run from repo root:
 *   DATABASE_URL=<your-url> npx tsx scripts/migrate-board-thanks.ts
 *
 * Or with the .env.production file:
 *   dotenv -e .env.production -- npx tsx scripts/migrate-board-thanks.ts
 */
import pg from "pg";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");

    // Add thanks_count column if it doesn't exist
    await client.query(`
      ALTER TABLE board_posts
      ADD COLUMN IF NOT EXISTS thanks_count integer NOT NULL DEFAULT 0
    `);

    // Create board_thanks table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS board_thanks (
        id         serial PRIMARY KEY,
        post_id    integer NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
        user_id    text    NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Unique index so each user can only thanks a post once
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS board_thanks_post_user_idx
      ON board_thanks (post_id, user_id)
    `);

    await client.query("COMMIT");
    console.log("Migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
