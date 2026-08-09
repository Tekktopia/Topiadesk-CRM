-- Deliberately named platform_current_user_id()/platform_current_role(),
-- NOT app_current_user_id()/app_current_role() — those already exist in
-- the tenant schema's `public` (packages/db/prisma/rls/002_policies.sql).
-- Distinct names sidestep any ambiguity about what's on this connection's
-- search_path (this client always connects with ?schema=platform — see
-- src/client.ts) rather than relying on cross-schema function resolution.
--
-- No OWN/DEPARTMENT/BRANCH tiering: there is no ownership hierarchy at the
-- platform level, only "is this a legitimate platform-admin session (or
-- SYSTEM_JOB, for the tenant-provisioning worker)" — same shape
-- documents_select uses in the tenant schema for low-sensitivity,
-- org-wide-visible data, not accounts_rw's owner-scoped one.

CREATE OR REPLACE FUNCTION platform_current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION platform_current_role() RETURNS text AS $$
  SELECT current_setting('app.current_role', true);
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'plans', 'subscriptions', 'platform_admin_users', 'tenant_provisioning_events',
    'support_tickets', 'support_ticket_comments', 'platform_audit_log'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_rw', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (platform_current_user_id() IS NOT NULL OR platform_current_role() = ''SYSTEM_JOB'') WITH CHECK (platform_current_user_id() IS NOT NULL OR platform_current_role() = ''SYSTEM_JOB'')',
      t || '_rw', t
    );
  END LOOP;
END $$;
