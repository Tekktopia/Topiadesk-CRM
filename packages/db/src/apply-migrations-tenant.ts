import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Applies every packages/db migration to a brand-new TENANT schema,
 * bypassing `prisma migrate deploy` entirely for this path — empirically
 * confirmed necessary, not a style choice:
 *
 * Prisma's Postgres connector, when given a `?schema=<name>` datasource
 * URL, issues its own `SET search_path = "<name>"` on connect — a single
 * schema, unconditionally, with no way to append `public` via the
 * connection string (`?schema=a,b` and `?options=-c search_path=...` were
 * both tried against a throwaway schema and both got overridden the same
 * way). packages/db's own migrations create a `vector(1536)` column
 * (semantic search embeddings) and rely on pgcrypto/pg_trgm — all three
 * extensions are installed once, database-wide, into `public` (Postgres
 * extensions are per-database singletons; `CREATE EXTENSION vector` a
 * second time in a different schema errors). With `public` excluded from
 * the connector's search_path, `prisma migrate deploy` against any schema
 * other than `public` fails immediately on migration #1 with `type
 * "vector" does not exist`.
 *
 * This function instead applies the same migration.sql files (verbatim,
 * same files `public` was built from — no per-tenant copies) via a raw
 * `pg` connection where WE control search_path
 * (`SET search_path = <schema>, public`), so unqualified new tables land
 * in the tenant schema while `vector`/pgcrypto/pg_trgm's types and
 * functions still resolve from `public`. It also hand-writes the
 * `_prisma_migrations` bookkeeping table (schema + checksum algorithm
 * copied from Prisma's own — sha256 hex of the raw file bytes, confirmed
 * empirically against packages/db's own already-applied
 * `public._prisma_migrations` rows) so that this schema's migration
 * history is indistinguishable, from Prisma's own tooling's point of
 * view, from one `prisma migrate deploy` would have produced — future
 * migrations added to packages/db still need a per-tenant apply step
 * (there is no live "apply to every tenant" runner yet — deferred past
 * Phase 1, see the plan), but at least `prisma migrate status` against
 * any tenant schema reports the truth if ever run by hand.
 *
 * All migrations run in ONE transaction (unlike `prisma migrate deploy`,
 * which applies each migration file as its own unit) — appropriate here
 * because this only ever runs once, against an empty just-created schema:
 * an all-or-nothing "does this tenant's schema exist correctly" outcome is
 * simpler to reason about than a partially-migrated tenant. None of
 * packages/db's migrations use `CREATE INDEX CONCURRENTLY` (confirmed by
 * grep), so nothing here requires running outside a transaction block.
 */
const TENANT_SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]+$/;

const prismaDir = join(__dirname, '..', 'prisma');
const migrationsDir = join(prismaDir, 'migrations');

function collectMigrationDirs(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function applyTenantMigrations(opts: { schemaName: string; directUrl: string }): Promise<void> {
  const { schemaName, directUrl } = opts;
  if (!TENANT_SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(`Refusing to apply tenant migrations: "${schemaName}" is not a valid tenant schema name (expected /${TENANT_SCHEMA_NAME_PATTERN.source}/).`);
  }

  const migrationDirs = collectMigrationDirs();
  const client = new Client({ connectionString: directUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET search_path = ${schemaName}, public`);

    // Same DDL shape as Prisma's own `_prisma_migrations` table (see this
    // file's header comment) — created unqualified so it lands in the
    // tenant schema, matching every other object these migrations create.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    for (const dir of migrationDirs) {
      const file = join(migrationsDir, dir, 'migration.sql');
      const sql = readFileSync(file, 'utf-8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      console.log(`[apply-migrations-tenant:${schemaName}] applying ${dir}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)`,
        [randomUUID(), checksum, dir],
      );
    }

    await client.query('COMMIT');
    console.log(`[apply-migrations-tenant:${schemaName}] applied ${migrationDirs.length} migration(s) successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[apply-migrations-tenant:${schemaName}] failed — rolled back all pending SQL in this run.`);
    throw err;
  } finally {
    await client.end();
  }
}
