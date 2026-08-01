-- Row-level security policies. Idempotent (DROP POLICY IF EXISTS + CREATE).
--
-- Model: RLS is the defense-in-depth backstop, not the sole authorization
-- mechanism — NestJS guards make the primary allow/deny decision per
-- endpoint using the same Permission/Role tables; these policies guarantee
-- that decision is enforced even if application code has a bug, and that a
-- raw SQL session can never see across scope boundaries.
--
-- Session variables (set per-request by packages/db/src/client.ts, one
-- Postgres session config each): app.current_user_id, app.current_role,
-- app.current_dept_id, app.current_branch_id.

-- =============================================================================
-- Helper functions
-- =============================================================================

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS text AS $$
  SELECT current_setting('app.current_role', true);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_dept_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_dept_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_branch_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_branch_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

/**
 * Highest scope (ALL > BRANCH > DEPARTMENT > OWN) the current session holds
 * for resource/action, per the Permission/RolePermission/UserRole tables.
 * SYSTEM_JOB (background workers) always resolves to ALL. Returns NULL if
 * no grant exists — every policy below treats NULL as deny.
 * SECURITY DEFINER + fixed search_path: policies query this function while
 * subject to RLS on the underlying tables it reads (user_roles etc. are not
 * themselves RLS-protected, so DEFINER isn't strictly required here, but is
 * set defensively so this function's behavior can't be altered by search_path
 * tricks from a lower-privileged caller).
 */
CREATE OR REPLACE FUNCTION app_max_scope(p_resource text, p_action text) RETURNS text AS $$
  SELECT CASE
    WHEN app_current_role() = 'SYSTEM_JOB' THEN 'ALL'
    WHEN app_current_role() = 'ADMIN' THEN 'ALL'
    ELSE (
      SELECT p.scope::text
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = app_current_user_id()
        AND p.resource = p_resource
        AND p.action = p_action
      ORDER BY CASE p.scope
        WHEN 'ALL' THEN 4 WHEN 'BRANCH' THEN 3 WHEN 'DEPARTMENT' THEN 2 WHEN 'OWN' THEN 1
      END DESC
      LIMIT 1
    )
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

/** True if `p_owner_id` (a users.id) is visible to the current session at the given resource/action. */
CREATE OR REPLACE FUNCTION app_can_access_owner(p_resource text, p_action text, p_owner_id uuid) RETURNS boolean AS $$
  SELECT CASE app_max_scope(p_resource, p_action)
    WHEN 'ALL' THEN true
    WHEN 'BRANCH' THEN p_owner_id IN (SELECT id FROM users WHERE branch_id = app_current_branch_id())
    WHEN 'DEPARTMENT' THEN p_owner_id IN (SELECT id FROM users WHERE department_id = app_current_dept_id())
    WHEN 'OWN' THEN p_owner_id = app_current_user_id()
    ELSE false
  END;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- accounts / account_relationships / contacts
-- =============================================================================

DROP POLICY IF EXISTS accounts_rw ON accounts;
CREATE POLICY accounts_rw ON accounts FOR ALL
  USING (app_can_access_owner('account', 'read', owner_id))
  WITH CHECK (app_can_access_owner('account', 'write', owner_id));

DROP POLICY IF EXISTS account_relationships_rw ON account_relationships;
CREATE POLICY account_relationships_rw ON account_relationships FOR ALL
  USING (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_a_id AND app_can_access_owner('account', 'read', a.owner_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_a_id AND app_can_access_owner('account', 'write', a.owner_id))
  );

-- Contacts: account-side contacts inherit the account's scoping; carrier-side
-- contacts (underwriters etc.) are visible to any authenticated staff member —
-- they are supply-side data, not client-sensitive in the same sense.
DROP POLICY IF EXISTS contacts_rw ON contacts;
CREATE POLICY contacts_rw ON contacts FOR ALL
  USING (
    (carrier_id IS NOT NULL AND app_current_user_id() IS NOT NULL)
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'read', a.owner_id))
  )
  WITH CHECK (
    (carrier_id IS NOT NULL AND app_current_user_id() IS NOT NULL)
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'write', a.owner_id))
  );

-- =============================================================================
-- leads / opportunities / opportunity_market_submissions
-- =============================================================================

DROP POLICY IF EXISTS leads_rw ON leads;
CREATE POLICY leads_rw ON leads FOR ALL
  USING (assigned_to_id IS NULL OR app_can_access_owner('lead', 'read', assigned_to_id))
  WITH CHECK (assigned_to_id IS NULL OR app_can_access_owner('lead', 'write', assigned_to_id));

DROP POLICY IF EXISTS opportunities_rw ON opportunities;
CREATE POLICY opportunities_rw ON opportunities FOR ALL
  USING (app_can_access_owner('opportunity', 'read', owner_id))
  WITH CHECK (app_can_access_owner('opportunity', 'write', owner_id));

DROP POLICY IF EXISTS opportunity_market_submissions_rw ON opportunity_market_submissions;
CREATE POLICY opportunity_market_submissions_rw ON opportunity_market_submissions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_id AND app_can_access_owner('opportunity', 'read', o.owner_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_id AND app_can_access_owner('opportunity', 'write', o.owner_id))
  );

-- =============================================================================
-- activities / tasks
-- =============================================================================

-- Activity can be linked to any of 4 parent entities (or none, e.g. a
-- standalone internal note) — visible if ANY linked parent is visible, or if
-- the current user authored it.
DROP POLICY IF EXISTS activities_rw ON activities;
CREATE POLICY activities_rw ON activities FOR ALL
  USING (
    created_by_id = app_current_user_id()
    OR (account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'read', a.owner_id)))
    OR (opportunity_id IS NOT NULL AND EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_id AND app_can_access_owner('opportunity', 'read', o.owner_id)))
    OR (lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_id AND (l.assigned_to_id IS NULL OR app_can_access_owner('lead', 'read', l.assigned_to_id))))
    OR (policy_id IS NOT NULL AND EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)))
  )
  WITH CHECK (created_by_id = app_current_user_id() OR app_max_scope('activity', 'write') = 'ALL');

DROP POLICY IF EXISTS tasks_rw ON tasks;
CREATE POLICY tasks_rw ON tasks FOR ALL
  USING (app_can_access_owner('task', 'read', assignee_id))
  WITH CHECK (app_can_access_owner('task', 'write', assignee_id));

-- =============================================================================
-- policies / policy_versions / premiums / renewal_schedules
-- Scoped via the linked Account's owner — a Policy always has an account_id.
-- =============================================================================

DROP POLICY IF EXISTS policies_rw ON policies;
CREATE POLICY policies_rw ON policies FOR ALL
  USING (EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('policy', 'read', a.owner_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('policy', 'write', a.owner_id)));

DROP POLICY IF EXISTS policy_versions_rw ON policy_versions;
CREATE POLICY policy_versions_rw ON policy_versions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'write', a.owner_id)
  ));

DROP POLICY IF EXISTS premiums_rw ON premiums;
CREATE POLICY premiums_rw ON premiums FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'write', a.owner_id)
  ));

-- RenewalSchedule: visible if assigned directly OR via the policy's account owner.
DROP POLICY IF EXISTS renewal_schedules_rw ON renewal_schedules;
CREATE POLICY renewal_schedules_rw ON renewal_schedules FOR ALL
  USING (
    (assigned_to_id IS NOT NULL AND app_can_access_owner('renewal_schedule', 'read', assigned_to_id))
    OR EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id))
  )
  WITH CHECK (app_max_scope('renewal_schedule', 'write') IS NOT NULL);

-- =============================================================================
-- documents / document_versions / document_links
-- Phase-1 scoping decision: documents are visible to any authenticated staff
-- member (not owner/department-scoped) — brokers routinely need to pull any
-- client's policy document quickly, and sensitivity here is governed by
-- retention/archival policy, not per-row ownership. Write access still
-- requires an explicit 'document'/'write' grant.
-- =============================================================================

DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT
  USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS documents_write ON documents;
CREATE POLICY documents_write ON documents FOR ALL
  USING (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL);

DROP POLICY IF EXISTS document_versions_select ON document_versions;
CREATE POLICY document_versions_select ON document_versions FOR SELECT
  USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS document_versions_write ON document_versions;
CREATE POLICY document_versions_write ON document_versions FOR INSERT
  WITH CHECK (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL);

DROP POLICY IF EXISTS document_links_rw ON document_links;
CREATE POLICY document_links_rw ON document_links FOR ALL
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL);

-- =============================================================================
-- approvals — maker-checker; visible to the requester, the (potential)
-- approver pool for that entity type, or ALL-scope roles (compliance/admin).
-- =============================================================================

DROP POLICY IF EXISTS approvals_rw ON approvals;
CREATE POLICY approvals_rw ON approvals FOR ALL
  USING (
    requested_by_id = app_current_user_id()
    OR approved_by_id = app_current_user_id()
    OR app_max_scope('approval', 'read') = 'ALL'
  )
  WITH CHECK (requested_by_id = app_current_user_id() OR app_max_scope('approval', 'write') = 'ALL');

-- =============================================================================
-- notifications — strictly per-recipient.
-- =============================================================================

DROP POLICY IF EXISTS notifications_rw ON notifications;
CREATE POLICY notifications_rw ON notifications FOR ALL
  USING (recipient_user_id = app_current_user_id() OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (recipient_user_id = app_current_user_id() OR app_current_role() = 'SYSTEM_JOB');

-- =============================================================================
-- ai_usage_ledger — self plus ALL-scope (admin/finance reviewing spend).
-- =============================================================================

DROP POLICY IF EXISTS ai_usage_ledger_rw ON ai_usage_ledger;
CREATE POLICY ai_usage_ledger_rw ON ai_usage_ledger FOR ALL
  USING (user_id = app_current_user_id() OR app_max_scope('ai_usage', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR user_id = app_current_user_id());

-- =============================================================================
-- audit_log — insert-only for SYSTEM_JOB/app writers (see triggers/), read
-- restricted to ALL-scope roles (compliance/admin). No UPDATE/DELETE policy
-- is defined on purpose: combined with the REVOKE in triggers/001, this
-- makes the table structurally append-only.
-- =============================================================================

DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (app_max_scope('audit_log', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

-- =============================================================================
-- integration_connectors / sync_jobs / integration_logs — technical/admin only.
-- =============================================================================

DROP POLICY IF EXISTS integration_connectors_rw ON integration_connectors;
CREATE POLICY integration_connectors_rw ON integration_connectors FOR ALL
  USING (app_max_scope('integration', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('integration', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS sync_jobs_rw ON sync_jobs;
CREATE POLICY sync_jobs_rw ON sync_jobs FOR ALL
  USING (app_max_scope('integration', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('integration', 'write') = 'ALL');

DROP POLICY IF EXISTS integration_logs_rw ON integration_logs;
CREATE POLICY integration_logs_rw ON integration_logs FOR ALL
  USING (app_max_scope('integration', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('integration', 'write') = 'ALL');
