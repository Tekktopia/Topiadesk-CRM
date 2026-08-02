import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { runRenewalScan } from '../src/jobs/renewal-alerts/renewal-scan.job';
import { applicableThreshold, dateBucket, daysBetween, nextAlertDate } from '../src/jobs/renewal-alerts/threshold';

/**
 * The concrete idempotency proof the renewal-alert feature exists for (see
 * docs/architecture.md and the Phase 1 build plan's "Production-hardening
 * mechanisms" #3). Runs the scan function directly against the real seeded
 * database (packages/db/prisma/seed.ts's policy TDK-PROP-2026-00042 and its
 * RenewalSchedule) — no Redis/BullMQ involved, this tests the actual DB
 * work a job tick performs, decoupled from queue mechanics. Mirrors
 * packages/db/test/rls-and-audit.integration.test.ts's pattern: requires
 * DATABASE_URL/DIRECT_URL pointed at an already migrated+apply-sql'd+seeded
 * Postgres instance.
 */

let adminClient: Client; // app_migrator via DIRECT_URL — setup/teardown/assertions, bypasses RLS by table ownership
let policyId: string;
let scheduleId: string;
let brokerUserId: string;

// Fixed reference "now" (not wall-clock) so the test's expected threshold
// math is stable regardless of when it actually runs. The seeded policy's
// RenewalSchedule.renewalDueDate gets overwritten to RENEWAL_DUE_DATE below
// specifically so `NOW` -> `RENEWAL_DUE_DATE` is always 45 days, landing
// inside the 60-day threshold window (not yet in the 30-day one).
const NOW = new Date('2026-08-01T12:00:00.000Z');
const RENEWAL_DUE_DATE = new Date('2026-09-15T00:00:00.000Z');
const THRESHOLDS = [90, 60, 30, 7];

beforeAll(async () => {
  adminClient = new Client({ connectionString: process.env.DIRECT_URL });
  await adminClient.connect();

  const policyRes = await adminClient.query<{ id: string }>(
    `SELECT id FROM policies WHERE policy_number = 'TDK-PROP-2026-00042'`,
  );
  if (policyRes.rows.length === 0) {
    throw new Error('Seeded policy TDK-PROP-2026-00042 not found — run `pnpm db:seed` against this database first.');
  }
  policyId = policyRes.rows[0]!.id;

  const scheduleRes = await adminClient.query<{ id: string }>('SELECT id FROM renewal_schedules WHERE policy_id = $1', [policyId]);
  scheduleId = scheduleRes.rows[0]!.id;

  const brokerRes = await adminClient.query<{ id: string }>(`SELECT id FROM users WHERE email = 'broker@topiadesk.local'`);
  brokerUserId = brokerRes.rows[0]!.id;
});

afterAll(async () => {
  await adminClient.end();
});

/** Re-arms the seeded schedule into a known "due now" state before each test, and clears any Notification rows a prior run left behind. */
async function resetSchedule() {
  await adminClient.query(
    `UPDATE renewal_schedules
     SET renewal_due_date = $2, alert_thresholds = $3, next_alert_due_at = $4,
         assigned_to_id = $5, status = 'ON_TRACK', last_alert_sent_at = NULL
     WHERE id = $1`,
    [scheduleId, RENEWAL_DUE_DATE, THRESHOLDS, new Date(NOW.getTime() - 60_000), brokerUserId],
  );
  await adminClient.query(`DELETE FROM notifications WHERE related_entity_id = $1 AND type = 'RENEWAL_ALERT'`, [policyId]);
}

describe('renewal-alert scan idempotency (real Postgres, real RLS, no mocks)', () => {
  beforeEach(resetSchedule);

  it('creates exactly one Notification for the applicable threshold, and a retry after a partial-failure crash is a pure no-op', async () => {
    const expectedThreshold = applicableThreshold(THRESHOLDS, daysBetween(NOW, RENEWAL_DUE_DATE));
    expect(expectedThreshold).toBe(60); // 45 days out: past the 90-day mark, not yet inside 30

    const first = await runRenewalScan(NOW);
    expect(first.notificationsCreated).toBe(1);
    expect(first.notificationsDeduped).toBe(0);

    const dedupeKey = `renewal-alert:${policyId}:${expectedThreshold}:${dateBucket(NOW)}`;
    const afterFirst = await adminClient.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = $1', [dedupeKey]);
    expect(afterFirst.rows[0]!.n).toBe(1);

    // The first run already advanced nextAlertDueAt past NOW, so a plain
    // re-run of runRenewalScan(NOW) would correctly select zero schedules
    // — that's the normal (and desired) self-exclusion behavior, not the
    // scenario this test is proving. The scenario that actually matters:
    // a worker crashes AFTER the Notification insert commits but BEFORE
    // (or concurrently with) the nextAlertDueAt advance — e.g. killed
    // mid-tick, or a second worker replica reads the pre-advance row. Force
    // that by re-arming nextAlertDueAt into the past without touching the
    // Notification that already exists, then re-run the scan: this is the
    // actual idempotency proof — the P2002 unique-violation path in
    // renewal-scan.job.ts must catch the resulting collision as a no-op,
    // not throw, and must NOT create a second row.
    await adminClient.query('UPDATE renewal_schedules SET next_alert_due_at = $2 WHERE id = $1', [
      scheduleId,
      new Date(NOW.getTime() - 60_000),
    ]);

    const second = await runRenewalScan(NOW);
    expect(second.notificationsCreated).toBe(0);
    expect(second.notificationsDeduped).toBe(1);

    const afterSecond = await adminClient.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = $1', [dedupeKey]);
    expect(afterSecond.rows[0]!.n).toBe(1); // still exactly one row
  });

  it('advances nextAlertDueAt to the next lower threshold date after firing', async () => {
    await runRenewalScan(NOW);
    const expectedThreshold = applicableThreshold(THRESHOLDS, daysBetween(NOW, RENEWAL_DUE_DATE));
    const expectedNext = nextAlertDate(RENEWAL_DUE_DATE, THRESHOLDS, expectedThreshold);

    const res = await adminClient.query<{ next_alert_due_at: Date }>('SELECT next_alert_due_at FROM renewal_schedules WHERE id = $1', [scheduleId]);
    expect(res.rows[0]!.next_alert_due_at.toISOString().slice(0, 10)).toBe(expectedNext!.toISOString().slice(0, 10));
  });

  it('two concurrently racing scans (simulating overlapping worker ticks) still produce exactly one Notification', async () => {
    await Promise.all([runRenewalScan(NOW), runRenewalScan(NOW)]);

    const expectedThreshold = applicableThreshold(THRESHOLDS, daysBetween(NOW, RENEWAL_DUE_DATE));
    const dedupeKey = `renewal-alert:${policyId}:${expectedThreshold}:${dateBucket(NOW)}`;
    const res = await adminClient.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE dedupe_key = $1', [dedupeKey]);
    expect(res.rows[0]!.n).toBe(1);
  });

  it('a schedule with no assignedToId falls back to the policy brokerOfRecordId', async () => {
    await adminClient.query('UPDATE renewal_schedules SET assigned_to_id = NULL WHERE id = $1', [scheduleId]);
    const result = await runRenewalScan(NOW);
    expect(result.notificationsCreated).toBe(1);

    const res = await adminClient.query<{ recipient_user_id: string }>(
      `SELECT recipient_user_id FROM notifications WHERE related_entity_id = $1 AND type = 'RENEWAL_ALERT'`,
      [policyId],
    );
    expect(res.rows[0]!.recipient_user_id).toBe(brokerUserId);
  });
});
