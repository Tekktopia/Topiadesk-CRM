-- Enables row-level security on every platform table. Idempotent (safe to
-- re-run on every `migrate:deploy`) — same pattern and same reasoning as
-- packages/db/prisma/rls/001_enable_rls.sql: only the connecting runtime
-- role (app_runtime) is subject to these policies; app_migrator (schema
-- owner) bypasses RLS as the table owner, which is correct and intentional
-- for migrations/seeding.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'plans', 'subscriptions', 'platform_admin_users', 'tenant_provisioning_events',
    'support_tickets', 'support_ticket_comments', 'platform_audit_log', 'platform_notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
