import { defineConfig } from 'vitest/config';

// Mirrors packages/db/vitest.integration.config.ts exactly — assumes
// DATABASE_URL/DIRECT_URL already point at a migrated + apply-sql'd +
// seeded Postgres instance (see that file's header comment for the full
// rationale). No testcontainers magic; this is what CI runs too.
export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
