import { Client } from 'pg';

/**
 * Creates a tenant's Postgres schema + the same privilege bootstrap
 * infra/postgres/init/01-roles-and-extensions.sh does for `public` at
 * cluster-init time (GRANT USAGE + ALTER DEFAULT PRIVILEGES so tables
 * applyTenantMigrations creates next automatically carry the correct
 * app_runtime grants, no per-table GRANT step needed) — except here as
 * app_migrator itself, not the `postgres` superuser: CREATE SCHEMA makes
 * app_migrator the schema's OWNER, and an owner can GRANT on its own
 * schema and ALTER DEFAULT PRIVILEGES FOR ROLE <itself> without needing
 * superuser at all (confirmed empirically — no permission error running
 * exactly these 3 statements as app_migrator against a throwaway schema).
 * `app_migrator`/`app_runtime` are hardcoded, not templated from env,
 * matching every other file in prisma/rls/ and prisma/triggers/ that
 * already hardcodes these two role names literally.
 */
const TENANT_SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]+$/;

export async function createTenantSchema(opts: { schemaName: string; directUrl: string }): Promise<void> {
  const { schemaName, directUrl } = opts;
  if (!TENANT_SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(`Refusing to create tenant schema: "${schemaName}" is not a valid tenant schema name (expected /${TENANT_SCHEMA_NAME_PATTERN.source}/).`);
  }
  const client = new Client({ connectionString: directUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schemaName} TO app_runtime`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA ${schemaName} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA ${schemaName} GRANT USAGE, SELECT ON SEQUENCES TO app_runtime`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

/** Rollback/cleanup counterpart — used when a later provisioning step fails (see provision-tenant.job.ts) and for tearing down a throwaway tenant after manual verification. */
export async function dropTenantSchema(opts: { schemaName: string; directUrl: string }): Promise<void> {
  const { schemaName, directUrl } = opts;
  if (!TENANT_SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(`Refusing to drop tenant schema: "${schemaName}" is not a valid tenant schema name.`);
  }
  const client = new Client({ connectionString: directUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
  } finally {
    await client.end();
  }
}
