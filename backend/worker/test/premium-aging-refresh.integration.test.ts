import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { runPremiumAgingRefresh } from '../src/jobs/premium-aging/refresh-aging.job';

/**
 * `refresh_premium_aging_summary()` is SECURITY INVOKER and its REFRESH
 * re-runs the view's query against `premiums`, an RLS-protected table
 * (prisma/rls/002_policies.sql's premiums_rw). This test exists because
 * that's a real footgun: calling the function without first binding a
 * SYSTEM_JOB RLS session context silently populates the materialized view
 * with ZERO rows instead of failing — see rls-raw-query.util.ts's comment.
 */
let adminClient: Client;

beforeAll(async () => {
  adminClient = new Client({ connectionString: process.env.DIRECT_URL });
  await adminClient.connect();
});

afterAll(async () => {
  await adminClient.end();
});

describe('premium-aging refresh (real Postgres, real RLS)', () => {
  it('populates premium_aging_summary with the outstanding premiums the seeded data has, not zero rows', async () => {
    await runPremiumAgingRefresh();

    const expected = await adminClient.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM premiums WHERE status IN ('PENDING','PARTIALLY_PAID','OVERDUE')`,
    );
    const actual = await adminClient.query<{ n: number }>('SELECT count(*)::int AS n FROM premium_aging_summary');
    expect(actual.rows[0]!.n).toBe(expected.rows[0]!.n);
  });
});
