import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Applies the hand-written RLS SQL under prisma/rls/ after every
 * `prisma migrate deploy` — identical shape and reasoning to
 * packages/db/src/apply-sql.ts, just pointed at PLATFORM_DIRECT_URL (the
 * `platform` schema) instead of DIRECT_URL (`public`). No triggers/
 * check-constraints directory here — the platform schema has neither an
 * audit hash-chain nor cross-column constraints (yet).
 */
const prismaDir = join(__dirname, '..', 'prisma');

function collectSqlFiles(subdir: string): string[] {
  const dir = join(prismaDir, subdir);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

async function main() {
  const directUrl = process.env.PLATFORM_DIRECT_URL;
  if (!directUrl) {
    throw new Error('PLATFORM_DIRECT_URL is required to apply RLS SQL (must connect as app_migrator).');
  }

  const files = collectSqlFiles('rls');
  if (files.length === 0) {
    console.log('[apply-sql:platform] no SQL files found — nothing to apply.');
    return;
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    // pg's Client ignores the `?schema=` query param (that's a
    // Prisma-only convention) — without this, unqualified statements like
    // `ALTER TABLE tenants ...` resolve against the connection's default
    // search_path (`"$user", public`), not `platform`.
    await client.query('SET search_path = platform');
    for (const file of files) {
      const sql = readFileSync(file, 'utf-8');
      console.log(`[apply-sql:platform] applying ${file.replace(prismaDir, 'prisma')}`);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log(`[apply-sql:platform] applied ${files.length} file(s) successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[apply-sql:platform] failed — rolled back all pending SQL in this run.');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
