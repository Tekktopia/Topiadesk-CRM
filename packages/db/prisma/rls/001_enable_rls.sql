-- Enables row-level security on every table holding scoped business data.
-- Idempotent (safe to re-run on every `migrate:deploy`).
--
-- IMPORTANT: this only has effect because the connecting runtime role
-- (app_runtime) is NOT the table owner and does NOT have BYPASSRLS — table
-- owners bypass RLS by default regardless of ENABLE/FORCE. Role setup lives
-- in infra/postgres/init/ (run once, as the Postgres superuser, on first
-- container boot). app_migrator (schema owner, used by `prisma migrate
-- deploy`, this script, and prisma/seed.ts) can still read/write everything,
-- which is correct and intentional: migrations, RLS/trigger bootstrap, and
-- seeding all run as the owner on purpose.
--
-- Deliberately NOT using FORCE ROW LEVEL SECURITY: it would also apply
-- policies to app_migrator itself, breaking the seed script and any future
-- admin/migration tooling that must run unrestricted as the owner. The
-- actual protection boundary is "only migration/seed tooling ever holds the
-- app_migrator credential" — enforced by secrets handling, not by SQL.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'account_relationships', 'contacts',
    'leads', 'opportunities', 'opportunity_market_submissions', 'activities', 'tasks',
    'policies', 'policy_versions', 'premiums', 'renewal_schedules',
    'documents', 'document_versions', 'document_links',
    'approvals', 'notifications', 'ai_usage_ledger',
    'audit_log', 'integration_connectors', 'sync_jobs', 'integration_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
