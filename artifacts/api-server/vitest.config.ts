import { defineConfig } from "vitest/config";
import { testDbUrl } from "./test/dbUrl";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // The catalog aggregation reads across ALL users and tests truncate tables
    // between cases, so they must not run concurrently against the shared test
    // database. Run all files in a single worker, sequentially.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // Set on the worker BEFORE any module (incl. @workspace/db, which reads
    // DATABASE_URL at import time) is evaluated, so the singleton pool connects
    // to the isolated test database.
    env: { DATABASE_URL: testDbUrl },
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: ["test/**/*.test.ts"],
  },
});
