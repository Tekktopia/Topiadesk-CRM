import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Schema-templated variant of apply-sql.ts, for tenant provisioning
 * (backend/worker/src/jobs/platform/provision-tenant.job.ts) rather than
 * this package's own single `public` schema. Applies the exact same RLS/
 * trigger .sql files under prisma/rls/ and prisma/triggers/ — no
 * per-tenant copies of those files — but:
 *
 * 1. Sets `search_path = <schema>, public` on the connection first, so
 *    every unqualified `ALTER TABLE accounts ...` / `CREATE POLICY ... ON
 *    accounts` / `CREATE TRIGGER ... ON accounts` resolves against the
 *    tenant's own schema (created by `prisma migrate deploy
 *    --schema=<schema>` immediately before this runs) rather than
 *    `public`. `public` stays on the path too — pgcrypto/pg_trgm/vector
 *    extensions and gen_random_uuid() live there, installed once
 *    database-wide, not per-schema.
 * 2. Rewrites every `SET search_path = public` function (the 5 in
 *    002_policies.sql/004_reporting_views.sql, plus the 3 audit-trigger
 *    functions in prisma/triggers/ — 8 total, all deliberately using this
 *    exact literal text, see each file's own comment) to
 *    `SET search_path = <schema>, public` in the SQL text itself before
 *    executing — these functions (5 SECURITY DEFINER, 3 plain trigger
 *    functions) all pin their OWN search_path at definition time, so
 *    leaving them as bare `public` would make a tenant's RLS policies or
 *    audit triggers silently evaluate against a DIFFERENT tenant's (or the
 *    original public schema's) tables instead of their own. `public`
 *    stays appended (not dropped) for every one of them, not just the 2
 *    that call pgcrypto's digest()/gen_random_uuid() directly — harmless
 *    for the other 6 (every name they reference exists in `<schema>`
 *    itself, found before search_path ever falls through to `public`) and
 *    keeps this a single uniform rule instead of two functions-shaped
 *    special cases. Every CREATE FUNCTION in these files is unqualified,
 *    so with search_path's first entry set to `<schema>` (per point 1),
 *    the function itself also gets created IN `<schema>` — each tenant
 *    ends up with its own independent copy, exactly like every other
 *    object these files create.
 *
 * `schemaName` is spliced directly into SQL text (both the `SET
 * search_path` connection-level statement and the in-file replacement) —
 * it cannot be parameterized like a normal query value (Postgres has no
 * bind-parameter support for identifiers/DDL), so it is validated against
 * a strict allowlist pattern before ever touching a query. Never pass a
 * caller-controlled string here without that validation — this is the one
 * place in the tenant-provisioning path where a bad tenant slug could
 * become SQL injection.
 */
const TENANT_SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]+$/;

const prismaDir = join(__dirname, '..', 'prisma');

function collectSqlFiles(subdir: string): string[] {
  const dir = join(prismaDir, subdir);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

export async function applyTenantRlsAndTriggers(opts: { schemaName: string; directUrl: string }): Promise<void> {
  const { schemaName, directUrl } = opts;
  if (!TENANT_SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(`Refusing to apply tenant RLS/triggers: "${schemaName}" is not a valid tenant schema name (expected /${TENANT_SCHEMA_NAME_PATTERN.source}/).`);
  }

  const files = [...collectSqlFiles('rls'), ...collectSqlFiles('triggers')];
  if (files.length === 0) {
    console.log(`[apply-sql-tenant:${schemaName}] no SQL files found — nothing to apply.`);
    return;
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    // Identifiers can't be bind-parameterized — schemaName is validated
    // above, immediately before this is the only place it's used to build
    // a query string.
    await client.query(`SET search_path = ${schemaName}, public`);
    for (const file of files) {
      const raw = readFileSync(file, 'utf-8');
      const sql = raw.replace(/SET search_path = public/g, `SET search_path = ${schemaName}, public`);
      console.log(`[apply-sql-tenant:${schemaName}] applying ${file.replace(prismaDir, 'prisma')}`);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log(`[apply-sql-tenant:${schemaName}] applied ${files.length} file(s) successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[apply-sql-tenant:${schemaName}] failed — rolled back all pending SQL in this run.`);
    throw err;
  } finally {
    await client.end();
  }
}
