import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { TEST_DB_NAME, testDbUrl, adminDbUrl } from "./dbUrl";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Create a fresh isolated test database and push the Drizzle schema into it
// once before the whole suite runs. Runs in the vitest main process.
export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  try {
    // TEST_DB_NAME is a code-controlled identifier (no user input), so it is
    // safe to interpolate. WITH (FORCE) drops any lingering connections from a
    // previous aborted run.
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }

  // Push the schema into the freshly created test database using the existing
  // drizzle-kit tooling, pointed at the test DB via DATABASE_URL.
  execSync("pnpm --filter @workspace/db run push-force", {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });
}
