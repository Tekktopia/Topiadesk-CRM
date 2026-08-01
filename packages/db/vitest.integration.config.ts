import { defineConfig } from 'vitest/config';

// Integration tests assume DATABASE_URL/DIRECT_URL already point at a
// migrated + apply-sql'd + seeded Postgres instance (see .github/workflows/
// ci.yml's `integration` job, or run the same three commands locally
// against a fresh `docker compose up postgres pgbouncer`). No testcontainers
// magic here — this mirrors exactly what CI does, deliberately, so a
// failure locally reproduces a CI failure and vice versa.
export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // RLS/audit-chain tests share one Postgres instance and must not
    // interleave writes to the shared audit_log hash chain across test
    // files running concurrently.
    fileParallelism: false,
  },
});
