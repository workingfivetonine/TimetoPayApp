// Derives an isolated test-database URL from the workspace DATABASE_URL so the
// integration tests NEVER touch the developer's real dev database. The catalog
// aggregation reads across ALL users, and the tests truncate tables between
// cases, so they must run against a throwaway database of their own.

const base = process.env.DATABASE_URL;
if (!base) {
  throw new Error("DATABASE_URL must be set to derive the test database URL");
}

const baseUrl = new URL(base);
const originalName = baseUrl.pathname.replace(/^\//, "") || "postgres";

// Stable, deterministic name so global setup can drop/recreate it each run.
export const TEST_DB_NAME = `${originalName}_vitest`;

const testUrl = new URL(base);
testUrl.pathname = `/${TEST_DB_NAME}`;

// URL used by the test workers (points at the isolated test database).
export const testDbUrl = testUrl.toString();

// URL used only by global setup to issue CREATE/DROP DATABASE. We connect to the
// original (maintenance) database to create the sibling test database.
export const adminDbUrl = base;
