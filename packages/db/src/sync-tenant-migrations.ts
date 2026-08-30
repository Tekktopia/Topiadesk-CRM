import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv } from '@topiadesk/config';

/**
 * The missing half of apply-migrations-tenant.ts, whose own header comment
 * flags exactly this gap: that file applies EVERY migration to a
 * brand-new tenant schema once, at provisioning — there was no way to
 * bring an ALREADY-EXISTING tenant schema forward when a NEW migration
 * gets added to packages/db later. `prisma migrate deploy` only ever
 * touches the `public` schema (see that file's header for why Prisma's
 * connector can't target a tenant schema directly), so every real tenant
 * silently fell behind `public` the moment this happened — confirmed
 * live: MailSettings.inbound* columns existed in `public` right after a
 * normal deploy, but every real tenant (`tenant_netfinity`,
 * `tenant_cribxpert`, `tenant_boltspeed_broadband_networks`) threw a real
 * PrismaClientKnownRequestError the instant anything queried those
 * columns in their own schema, because the columns simply didn't exist
 * there.
 *
 * Run this after any `packages/db` migration that needs to reach tenants
 * created before it existed: `pnpm --filter @topiadesk/db migrate:tenants`.
 * Idempotent — reads each tenant schema's own `_prisma_migrations` table
 * first and only applies what that schema doesn't already have, so
 * running it repeatedly (or on a mix of old/new tenants) is always safe.
 * Each migration file commits in its OWN transaction (unlike
 * apply-migrations-tenant.ts's single all-or-nothing transaction, which is
 * fine there because it only ever runs once against an empty schema) —
 * here, a failure partway through a tenant's pending set must not roll
 * back migrations that already applied cleanly for it.
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

async function listActiveTenantSchemas(platformDirectUrl: string): Promise<string[]> {
  const client = new Client({ connectionString: platformDirectUrl });
  await client.connect();
  try {
    await client.query('SET search_path = platform');
    const res = await client.query<{ schema_name: string }>("SELECT schema_name FROM tenants WHERE status = 'ACTIVE'");
    return res.rows.map((r) => r.schema_name).filter((s) => TENANT_SCHEMA_NAME_PATTERN.test(s));
  } finally {
    await client.end();
  }
}

async function syncOneTenant(schemaName: string, directUrl: string, allMigrations: string[]): Promise<string[]> {
  const client = new Client({ connectionString: directUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`SET search_path = ${schemaName}, public`);
    const existing = await client
      .query<{ migration_name: string }>('SELECT migration_name FROM "_prisma_migrations"')
      .catch(() => ({ rows: [] as { migration_name: string }[] }));
    const already = new Set(existing.rows.map((r) => r.migration_name));
    const pending = allMigrations.filter((m) => !already.has(m));

    for (const dir of pending) {
      const file = join(migrationsDir, dir, 'migration.sql');
      const sql = readFileSync(file, 'utf-8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, now(), 1)`,
          [randomUUID(), checksum, dir],
        );
        await client.query('COMMIT');
        applied.push(dir);
        console.log(`[sync-tenant-migrations:${schemaName}] applied ${dir}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${dir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const allMigrations = collectMigrationDirs();
  const schemas = await listActiveTenantSchemas(env.PLATFORM_DIRECT_URL);
  console.log(`[sync-tenant-migrations] ${schemas.length} active tenant schema(s), ${allMigrations.length} known migration(s)`);

  let failures = 0;
  for (const schema of schemas) {
    try {
      const applied = await syncOneTenant(schema, env.DIRECT_URL, allMigrations);
      if (applied.length === 0) console.log(`[sync-tenant-migrations:${schema}] already up to date`);
    } catch (err) {
      failures += 1;
      console.error(`[sync-tenant-migrations:${schema}] failed — earlier migrations in this run for this tenant were still committed individually:`, err);
    }
  }
  if (failures > 0) {
    console.error(`[sync-tenant-migrations] ${failures} tenant(s) failed — see above.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[sync-tenant-migrations] fatal', err);
  process.exitCode = 1;
});
