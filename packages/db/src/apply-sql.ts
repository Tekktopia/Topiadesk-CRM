import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Applies the hand-written RLS/trigger/constraint SQL that Prisma's schema
 * DSL cannot express, after every `prisma migrate deploy`. Runs as
 * app_migrator (the table owner — required to ALTER TABLE ... ENABLE ROW
 * LEVEL SECURITY, CREATE POLICY, CREATE TRIGGER) via DIRECT_URL, and wraps
 * every file in one transaction so a partial failure never leaves the
 * database half-migrated. Every .sql file is written to be idempotent
 * (CREATE OR REPLACE / DROP ... IF EXISTS / guarded DO blocks), so this is
 * safe to re-run on every deploy, not just the first.
 */
// __dirname is available natively under CommonJS (no import.meta needed).
const prismaDir = join(__dirname, '..', 'prisma');

function collectSqlFiles(subdir: string): string[] {
  const dir = join(prismaDir, subdir);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error('DIRECT_URL is required to apply RLS/trigger SQL (must connect as app_migrator).');
  }

  const files = [...collectSqlFiles('rls'), ...collectSqlFiles('triggers')];
  if (files.length === 0) {
    console.log('[apply-sql] no SQL files found — nothing to apply.');
    return;
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    for (const file of files) {
      const sql = readFileSync(file, 'utf-8');
      console.log(`[apply-sql] applying ${file.replace(prismaDir, 'prisma')}`);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log(`[apply-sql] applied ${files.length} file(s) successfully.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[apply-sql] failed — rolled back all pending SQL in this run.');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
