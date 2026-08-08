import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { getPrismaClient, runWithRlsContext, type RlsContext } from '../src/client';

/**
 * Formalizes the manual verification performed during Phase 0 (see
 * docs/architecture.md's "Row-level security" / "Audit trail" sections for
 * what these assertions mean and why). Requires DATABASE_URL/DIRECT_URL to
 * point at an already-migrated + apply-sql'd + seeded database — see this
 * file's sibling vitest.integration.config.ts header comment.
 */

let rawRuntimeClient: Client; // connects as app_runtime, for direct-SQL RLS assertions
let adminClient: Client; // connects as app_migrator, for setup/teardown assertions

let brokerId: string;
let brokerDeptId: string;
let managerId: string;
let complianceId: string;

beforeAll(async () => {
  adminClient = new Client({ connectionString: process.env.DIRECT_URL });
  await adminClient.connect();

  rawRuntimeClient = new Client({ connectionString: process.env.DATABASE_URL });
  await rawRuntimeClient.connect();

  const users = await adminClient.query<{ id: string; email: string; department_id: string }>(
    `SELECT id, email, department_id FROM users WHERE email IN ($1, $2, $3)`,
    ['broker@topiadesk.local', 'manager@topiadesk.local', 'compliance@topiadesk.local'],
  );
  const byEmail = Object.fromEntries(users.rows.map((r) => [r.email, r]));
  brokerId = byEmail['broker@topiadesk.local']!.id;
  brokerDeptId = byEmail['broker@topiadesk.local']!.department_id;
  managerId = byEmail['manager@topiadesk.local']!.id;
  complianceId = byEmail['compliance@topiadesk.local']!.id;
});

afterAll(async () => {
  await rawRuntimeClient.end();
  await adminClient.end();
});

async function setSession(client: Client, ctx: { userId: string; role: string; deptId?: string }) {
  await client.query(
    `SELECT set_config('app.current_user_id', $1, false),
            set_config('app.current_role', $2, false),
            set_config('app.current_dept_id', $3, false),
            set_config('app.current_branch_id', '', false)`,
    [ctx.userId, ctx.role, ctx.deptId ?? ''],
  );
}

describe('Row-level security (raw SQL, direct policy verification)', () => {
  it('returns zero rows with no session context bound (fail closed)', async () => {
    await setSession(rawRuntimeClient, { userId: '', role: '' });
    const res = await rawRuntimeClient.query('SELECT count(*)::int AS n FROM accounts');
    expect(res.rows[0].n).toBe(0);
  });

  it('scopes an ACCOUNT_HANDLER (OWN scope) to only their own accounts', async () => {
    await setSession(rawRuntimeClient, { userId: brokerId, role: 'ACCOUNT_HANDLER', deptId: brokerDeptId });
    const res = await rawRuntimeClient.query('SELECT owner_id FROM accounts');
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) expect(row.owner_id).toBe(brokerId);
  });

  it('scopes a MANAGER (DEPARTMENT scope) to accounts owned within their department', async () => {
    await setSession(rawRuntimeClient, { userId: managerId, role: 'MANAGER', deptId: brokerDeptId });
    const res = await rawRuntimeClient.query('SELECT count(*)::int AS n FROM accounts');
    expect(res.rows[0].n).toBeGreaterThan(0);
  });

  it('rejects a direct UPDATE against audit_log as app_runtime (tamper protection)', async () => {
    await setSession(rawRuntimeClient, { userId: complianceId, role: 'COMPLIANCE_OFFICER' });
    await expect(
      rawRuntimeClient.query('UPDATE audit_log SET current_hash = $1 WHERE id = (SELECT min(id) FROM audit_log)', [
        'tampered',
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('RLS-aware Prisma client (packages/db/src/client.ts) — the actual application-facing path', () => {
  it('applies scoping correctly through the interactive-transaction wrapper', async () => {
    const prisma = getPrismaClient();
    const ctx: RlsContext = {
      userId: brokerId,
      role: 'ACCOUNT_HANDLER',
      departmentId: brokerDeptId,
      branchId: null,
      clientIp: '127.0.0.1',
      tenantSchema: 'public',
    };
    const accounts = await runWithRlsContext(ctx, () => prisma.account.findMany());
    expect(accounts.length).toBeGreaterThan(0);
    for (const a of accounts) expect(a.ownerId).toBe(brokerId);
  });

  it('does not leak session context across concurrent requests with different users', async () => {
    const prisma = getPrismaClient();
    const brokerCtx: RlsContext = { userId: brokerId, role: 'ACCOUNT_HANDLER', departmentId: brokerDeptId, branchId: null, clientIp: null, tenantSchema: 'public' };
    const complianceCtx: RlsContext = { userId: complianceId, role: 'COMPLIANCE_OFFICER', departmentId: null, branchId: null, clientIp: null, tenantSchema: 'public' };

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? runWithRlsContext(brokerCtx, () => prisma.account.findMany()).then((r) => ({ who: 'broker', count: r.length }))
          : runWithRlsContext(complianceCtx, () => prisma.account.findMany()).then((r) => ({ who: 'compliance', count: r.length })),
      ),
    );

    const brokerCounts = new Set(results.filter((r) => r.who === 'broker').map((r) => r.count));
    const complianceCounts = new Set(results.filter((r) => r.who === 'compliance').map((r) => r.count));
    expect(brokerCounts.size).toBe(1);
    expect(complianceCounts.size).toBe(1);
  });
});

describe('Audit hash chain integrity', () => {
  it('every stored current_hash matches an independent recomputation', async () => {
    const res = await adminClient.query<{ mismatches: number }>(`
      SELECT count(*)::int AS mismatches FROM (
        SELECT id, current_hash,
          encode(digest(
            COALESCE(prev_hash,'') || jsonb_build_object(
              'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
              'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
              'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
            )::text, 'sha256'), 'hex') AS recomputed
        FROM audit_log
      ) x WHERE current_hash <> recomputed
    `);
    expect(res.rows[0]!.mismatches).toBe(0);
  });

  it('detects a tampered row via mismatch (using a throwaway row, not touching real seed data)', async () => {
    // Insert as app_migrator directly (bypasses the app_runtime REVOKE, which
    // is exactly the "how would we ever detect a truly out-of-band write"
    // case this test proves the verification query catches).
    await adminClient.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, chain_lane, current_hash)
       VALUES ('test_entity', gen_random_uuid(), 'CREATE', 0, '')`,
    );
    const inserted = await adminClient.query<{ id: string; current_hash: string }>(
      `SELECT id, current_hash FROM audit_log WHERE entity_type = 'test_entity' ORDER BY id DESC LIMIT 1`,
    );
    const row = inserted.rows[0]!;
    await adminClient.query(`UPDATE audit_log SET current_hash = 'deliberately-corrupted-hash-value-000000000000000000000000' WHERE id = $1`, [row.id]);

    const res = await adminClient.query<{ mismatches: number }>(
      `SELECT count(*)::int AS mismatches FROM (
        SELECT id, current_hash,
          encode(digest(
            COALESCE(prev_hash,'') || jsonb_build_object(
              'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
              'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
              'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
            )::text, 'sha256'), 'hex') AS recomputed
        FROM audit_log WHERE id = $1
      ) x WHERE current_hash <> recomputed`,
      [row.id],
    );
    expect(res.rows[0]!.mismatches).toBe(1);

    // Clean up the throwaway row so this test is repeatable and doesn't
    // permanently poison the chain for later runs/tests.
    await adminClient.query('DELETE FROM audit_log WHERE id = $1', [row.id]);
  });

  it('create_audit_checkpoint() produces a valid anchor over current lane heads', async () => {
    const res = await adminClient.query<{ create_audit_checkpoint: string }>('SELECT create_audit_checkpoint()');
    expect(res.rows[0]!.create_audit_checkpoint).toBeTruthy();
    const checkpoint = await adminClient.query(
      'SELECT anchor_hash FROM audit_checkpoints WHERE id = $1',
      [res.rows[0]!.create_audit_checkpoint],
    );
    expect(checkpoint.rows[0]!.anchor_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
