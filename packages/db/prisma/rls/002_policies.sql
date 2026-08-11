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

/** True if `p_owner_id` (a users.id) is visible to the current session at
 * the given resource/action. SECURITY DEFINER (identity-enterprise pass,
 * matching app_max_scope's existing pattern) — `users` now carries its own
 * RLS (users_rw below). Its read side is deliberately left unconditionally
 * open (see that policy's comment), so in the FINAL design this function's
 * BRANCH/DEPARTMENT subqueries against `users` aren't actually narrowed by
 * it; DEFINER is kept anyway as defense in depth — this function backs
 * WRITE-side scoping for accounts/cases/policies/users/etc. across the
 * whole app, and its BRANCH/DEPARTMENT branches need a guaranteed-unfiltered
 * view of `users` regardless of whatever that table's read policy happens
 * to be at any given time, not something that should depend on a different
 * policy's current shape staying exactly as-is.
 */
CREATE OR REPLACE FUNCTION app_can_access_owner(p_resource text, p_action text, p_owner_id uuid) RETURNS boolean AS $$
  SELECT CASE app_max_scope(p_resource, p_action)
    WHEN 'ALL' THEN true
    WHEN 'BRANCH' THEN p_owner_id IN (SELECT id FROM users WHERE branch_id = app_current_branch_id())
    WHEN 'DEPARTMENT' THEN p_owner_id IN (SELECT id FROM users WHERE department_id = app_current_dept_id())
    WHEN 'OWN' THEN p_owner_id = app_current_user_id()
    ELSE false
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

/** Additive visibility grant on top of department/branch scoping — matches
 * TeamMember's own doc comment ("not a third nested RLS level"). Used by
 * cases_rw for team-queue visibility.
 * `SET search_path = public` was missing here (unlike every sibling
 * function above/below it) — found live via a real, intermittent
 * "relation team_members does not exist" error: PgBouncer transaction
 * pooling means the physical connection a query lands on isn't guaranteed
 * to be the one Prisma's `?schema=` set search_path on for this specific
 * PrismaClient, so an unqualified reference inside a SQL-language function
 * (inlined into the caller's plan, same class of risk as raw SQL —
 * SECURITY DEFINER's own proconfig doesn't protect an inlined function
 * body) resolves against whatever the pooled connection's search_path
 * happened to be left at. */
CREATE OR REPLACE FUNCTION app_is_team_member(p_team_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = app_current_user_id());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

/** True if `p_user_id` is in the same department as the current session's
 * user — extracted (identity-enterprise pass) from what was previously an
 * inline `SELECT ... FROM users u1, users u2 ...` subquery duplicated in
 * saved_views_rw/saved_dashboards_rw below, purely for DRYness/single
 * source of truth. SECURITY DEFINER as defense in depth, same reasoning as
 * app_can_access_owner above. */
CREATE OR REPLACE FUNCTION app_same_department(p_user_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u1, users u2
    WHERE u1.id = p_user_id AND u2.id = app_current_user_id() AND u1.department_id = u2.department_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- users — identity-enterprise pass: delegated admin scoping for WRITES only.
-- `users` previously had no RLS at all (see 001_enable_rls.sql's enable
-- list), meaning any 'identity':'write' grant — regardless of scope — was
-- effectively org-wide, since PermissionGuard only checks that a grant
-- exists for the resource+action, not which scope. This closes that gap for
-- writes (deactivate/suspend/role-assign/etc.) using the same
-- OWN/DEPARTMENT/BRANCH/ALL shape as accounts_rw immediately below: `id`
-- (the row's own PK) is passed as the "owner".
--
-- READ deliberately stays "any authenticated user" (documents_select's
-- exact philosophy, not accounts_rw's owner-scoped one) rather than also
-- gating on app_can_access_owner('identity', 'read', id) — a user's name/
-- department is routine, low-sensitivity metadata resolved constantly
-- throughout the app for purposes that have nothing to do with "managing"
-- anyone: assignee dropdowns, "created by" labels, notification-recipient
-- lookups (e.g. cases.controller.ts notifying every COMPLIANCE_OFFICER of
-- a pending closure approval), dashboard agent-workload name resolution.
-- None of those call sites hold (or should need) a broad 'identity' grant.
-- Gating read the same way write is gated was tried first and rejected:
-- it would have silently emptied every one of those lookups for any role
-- below ALL/DEPARTMENT scope — the exact "fails closed, no error" RLS bug
-- class this session already hit twice for documents/approval_chains.
--
-- RlsContextMiddleware's own bootstrap lookup (which necessarily runs
-- before any real context exists, so even the open read side doesn't help
-- it) explicitly runs under SYSTEM_JOB_CONTEXT to bypass this — see that
-- file's comment.
-- =============================================================================

DROP POLICY IF EXISTS users_rw ON users;
CREATE POLICY users_rw ON users FOR ALL
  USING (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_can_access_owner('identity', 'write', id));

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
-- they are supply-side data, not client-sensitive in the same sense. (A
-- standalone contact with neither is impossible at the DB level regardless —
-- see 003_check_constraints.sql's contacts_exactly_one_parent — so omnichannel
-- intake, unlike Case/Activity, deliberately never creates a Contact: an
-- unmatched visitor's name/email lives on the Case/Activity row instead.)
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

-- Data Subject Requests — child-of-contact-of-account, same inherited
-- scoping shape as account_sla_overrides/sites below (via 'account'
-- read/write, since Contact has no dedicated resource of its own — see
-- ContactsController's header comment). No carrier-side branch: a DSR only
-- ever targets an account-side contact (a carrier-side contact — an
-- underwriter — isn't a data subject this org holds PII for in the same
-- sense).
DROP POLICY IF EXISTS data_subject_requests_rw ON data_subject_requests;
CREATE POLICY data_subject_requests_rw ON data_subject_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts c JOIN accounts a ON a.id = c.account_id
      WHERE c.id = contact_id AND app_can_access_owner('account', 'read', a.owner_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c JOIN accounts a ON a.id = c.account_id
      WHERE c.id = contact_id AND app_can_access_owner('account', 'write', a.owner_id)
    )
  );

-- Consent records — same child-of-contact-of-account shape as
-- data_subject_requests_rw immediately above.
DROP POLICY IF EXISTS consent_records_rw ON consent_records;
CREATE POLICY consent_records_rw ON consent_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts c JOIN accounts a ON a.id = c.account_id
      WHERE c.id = contact_id AND app_can_access_owner('account', 'read', a.owner_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c JOIN accounts a ON a.id = c.account_id
      WHERE c.id = contact_id AND app_can_access_owner('account', 'write', a.owner_id)
    )
  );

-- Same shape as account_relationships_rw above — a child-of-account config
-- row, visible/writable exactly when the parent account is.
DROP POLICY IF EXISTS account_sla_overrides_rw ON account_sla_overrides;
CREATE POLICY account_sla_overrides_rw ON account_sla_overrides FOR ALL
  USING (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'read', a.owner_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'write', a.owner_id))
  );

-- Sites (an account's branches/locations) — same child-of-account shape again.
DROP POLICY IF EXISTS sites_rw ON sites;
CREATE POLICY sites_rw ON sites FOR ALL
  USING (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'read', a.owner_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'write', a.owner_id))
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

-- Activity can be linked to any of 6 parent entities (or none, e.g. a
-- standalone internal note) — visible if ANY linked parent is visible, or if
-- the current user authored it. createdById is nullable (SYSTEM_JOB-authored
-- inbound-webhook ingestion sets createdBySystemJob instead — see
-- activities_actor_xor in 003_check_constraints.sql) — SYSTEM_JOB already
-- resolves to ALL scope via app_max_scope, so no extra branch is needed for
-- the write side beyond the existing ALL-scope check.
DROP POLICY IF EXISTS activities_rw ON activities;
CREATE POLICY activities_rw ON activities FOR ALL
  USING (
    created_by_id = app_current_user_id()
    OR app_current_role() = 'SYSTEM_JOB'
    OR (account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'read', a.owner_id)))
    OR (opportunity_id IS NOT NULL AND EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_id AND app_can_access_owner('opportunity', 'read', o.owner_id)))
    OR (lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_id AND (l.assigned_to_id IS NULL OR app_can_access_owner('lead', 'read', l.assigned_to_id))))
    OR (policy_id IS NOT NULL AND EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)))
    OR (claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id AND (
          (c.adjuster_id IS NOT NULL AND app_can_access_owner('claim', 'read', c.adjuster_id))
          OR EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id WHERE p.id = c.policy_id AND app_can_access_owner('claim', 'read', a.owner_id))
        )))
    OR (case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases cs WHERE cs.id = case_id AND (
          (cs.assigned_to_id IS NOT NULL AND app_can_access_owner('case', 'read', cs.assigned_to_id))
          OR (cs.account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = cs.account_id AND app_can_access_owner('case', 'read', a.owner_id)))
          OR (cs.assigned_team_id IS NOT NULL AND app_is_team_member(cs.assigned_team_id))
        )))
  )
  WITH CHECK (created_by_id = app_current_user_id() OR app_max_scope('activity', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

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

-- E-signature requests — same child-of-policy-of-account shape as
-- policy_versions_rw immediately above.
DROP POLICY IF EXISTS signature_requests_rw ON signature_requests;
CREATE POLICY signature_requests_rw ON signature_requests FOR ALL
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
-- policy_coverages / policy_participants / policy_assets
-- Policy depth (FSC's InsurancePolicyCoverage/Participant/Asset) — plain
-- child-of-Policy scoping, same shape as renewal_schedules_rw above. No
-- dedicated resource: nothing in the FSC spec calls out these as more
-- sensitive than the policy record itself, unlike producer_commissions
-- below.
-- =============================================================================

DROP POLICY IF EXISTS policy_coverages_rw ON policy_coverages;
CREATE POLICY policy_coverages_rw ON policy_coverages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'write', a.owner_id)
  ));

DROP POLICY IF EXISTS policy_participants_rw ON policy_participants;
CREATE POLICY policy_participants_rw ON policy_participants FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'write', a.owner_id)
  ));

DROP POLICY IF EXISTS policy_assets_rw ON policy_assets;
CREATE POLICY policy_assets_rw ON policy_assets FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'write', a.owner_id)
  ));

-- =============================================================================
-- producer_policy_assignments / producer_commissions
-- 'producers' itself carries no RLS (see 001_enable_rls.sql's comment —
-- same config-tier as carriers/pipelines, gated purely by
-- @RequirePermission at the controller layer).
--
-- producer_policy_assignments (who's assigned + their split %, not $
-- amounts) scopes through the same 'policy' grant premiums_rw already
-- uses — simplest correct answer, no new resource needed for this one.
--
-- producer_commissions (the actual payable $ record) uses its OWN
-- 'producer_commission' resource instead of reusing 'policy' — the FSC
-- spec this model was built from explicitly calls out commission amounts
-- as more sensitive than general policy data ("visible only to Manager +
-- Finance"), so this needs to be independently OWN/DEPARTMENT/ALL-tunable
-- from a line broker's regular 'policy' grant, not permanently coupled to
-- it. Write (create/approve/mark-paid) is additionally gated at the
-- controller layer via @RequirePermission('producer_commission', 'write')
-- requiring DEPARTMENT+ scope — RLS here only answers "can this row be
-- seen/touched at all", same two-layer split PermissionGuard/RLS already
-- use everywhere else in this codebase.
-- =============================================================================

DROP POLICY IF EXISTS producer_policy_assignments_rw ON producer_policy_assignments;
CREATE POLICY producer_policy_assignments_rw ON producer_policy_assignments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('policy', 'write', a.owner_id)
  ));

DROP POLICY IF EXISTS producer_commissions_rw ON producer_commissions;
CREATE POLICY producer_commissions_rw ON producer_commissions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('producer_commission', 'read', a.owner_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = policy_id AND app_can_access_owner('producer_commission', 'write', a.owner_id)
  ));

-- =============================================================================
-- documents / document_versions / document_links
-- Phase-1 scoping decision: documents are visible to any authenticated staff
-- member (not owner/department-scoped) — brokers routinely need to pull any
-- client's policy document quickly, and sensitivity here is governed by
-- retention/archival policy, not per-row ownership. Write access still
-- requires an explicit 'document'/'write' grant.
-- =============================================================================

-- Phase 6: SELECT policies below also carry an `OR app_current_role() =
-- 'SYSTEM_JOB'` carve-out, matching the pattern every other table's policy
-- in this file already uses (activities_rw, approvals, notifications, ...).
-- Without it, the portal module's documents endpoints (portal.controller.ts,
-- running under SYSTEM_JOB_CONTEXT — see that file's header comment) got
-- zero rows back with no error: app_current_user_id() is NULL under that
-- context (userId: '' in rls-context.ts), so the original
-- app_current_user_id() IS NOT NULL check silently failed closed. Caught
-- via live testing (a document correctly linked to an account came back as
-- an empty list). Write policies are untouched — the portal never writes
-- documents, only reads.
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT
  USING (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS documents_write ON documents;
CREATE POLICY documents_write ON documents FOR ALL
  USING (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL)
  WITH CHECK (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL);

DROP POLICY IF EXISTS document_versions_select ON document_versions;
CREATE POLICY document_versions_select ON document_versions FOR SELECT
  USING (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS document_versions_write ON document_versions;
CREATE POLICY document_versions_write ON document_versions FOR INSERT
  WITH CHECK (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL);

DROP POLICY IF EXISTS document_links_rw ON document_links;
CREATE POLICY document_links_rw ON document_links FOR ALL
  USING (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_user_id() IS NOT NULL AND app_max_scope('document', 'write') IS NOT NULL);

-- =============================================================================
-- approvals — maker-checker; visible to the requester, the (potential)
-- approver pool for that entity type, or ALL-scope roles (compliance/admin).
-- =============================================================================

-- A CASE_AUTOMATION_GATE approval whose gate names specific approvers
-- (AutomationRunState.context.approverAllowlist, frozen at gate-open time —
-- see that column's own comment) must be visible/decidable by exactly those
-- people even when they hold none of `approval:read`/`write` ALL scope
-- (e.g. a MANAGER named as an explicit approver, or resolved via
-- ASSIGNEE_MANAGER/TEAM_LEAD) — without this, only COMPLIANCE_OFFICER/ADMIN
-- could ever decide ANY named-approver gate, defeating the whole point of
-- naming one. `ad.delegator_id::text` lets an active ApprovalDelegation
-- (approval_delegations, below) stand in for someone on the allowlist —
-- the one Approval entityType where delegation is load-bearing; the other
-- four already sit behind a broad ALL-scope pool with nothing to delegate.
-- Joins on approval_id (single-approver gates) OR approval_chain_id
-- (quorum gates: decideChainedGate() INSERTs a fresh row per decider, so
-- the new row's own `id` isn't known to automation_run_states yet — only
-- its `chain_id` is, via the chain the gate opened).
DROP POLICY IF EXISTS approvals_rw ON approvals;
CREATE POLICY approvals_rw ON approvals FOR ALL
  USING (
    requested_by_id = app_current_user_id()
    OR approved_by_id = app_current_user_id()
    OR app_max_scope('approval', 'read') = 'ALL'
    OR (
      entity_type = 'CASE_AUTOMATION_GATE'
      AND EXISTS (
        SELECT 1 FROM automation_run_states ars
        WHERE (ars.approval_id = approvals.id OR ars.approval_chain_id = approvals.chain_id)
          AND (
            ars.context -> 'approverAllowlist' ? app_current_user_id()::text
            OR EXISTS (
              SELECT 1 FROM approval_delegations ad
              WHERE ad.delegate_id = app_current_user_id()
                AND now() BETWEEN ad.starts_at AND ad.ends_at
                AND ars.context -> 'approverAllowlist' ? ad.delegator_id::text
            )
          )
      )
    )
  )
  WITH CHECK (
    requested_by_id = app_current_user_id()
    OR app_max_scope('approval', 'write') = 'ALL'
    OR (
      entity_type = 'CASE_AUTOMATION_GATE'
      AND EXISTS (
        SELECT 1 FROM automation_run_states ars
        WHERE (ars.approval_id = approvals.id OR ars.approval_chain_id = approvals.chain_id)
          AND (
            ars.context -> 'approverAllowlist' ? app_current_user_id()::text
            OR EXISTS (
              SELECT 1 FROM approval_delegations ad
              WHERE ad.delegate_id = app_current_user_id()
                AND now() BETWEEN ad.starts_at AND ad.ends_at
                AND ars.context -> 'approverAllowlist' ? ad.delegator_id::text
            )
          )
      )
    )
  );

-- Self-service: a delegator manages their own standing instruction, a
-- delegate can see (never edit) delegations naming them so they understand
-- why a gate they didn't request now shows up as theirs to decide, and
-- COMPLIANCE_OFFICER/ADMIN (approval:read/write ALL) get full oversight —
-- same tier as approvals_rw itself, since a delegation is really "who may
-- decide an approval" metadata.
DROP POLICY IF EXISTS approval_delegations_rw ON approval_delegations;
CREATE POLICY approval_delegations_rw ON approval_delegations FOR ALL
  USING (
    delegator_id = app_current_user_id()
    OR delegate_id = app_current_user_id()
    OR app_max_scope('approval', 'read') = 'ALL'
    OR app_current_role() = 'SYSTEM_JOB'
  )
  WITH CHECK (
    delegator_id = app_current_user_id()
    OR app_max_scope('approval', 'write') = 'ALL'
    OR app_current_role() = 'SYSTEM_JOB'
  );

-- ApprovalChain has no requester/approver column of its own (only its
-- linked Approval rows do), and no sensitive fields at all — just
-- entityType/entityId/requiredApprovals/status. Readable by any
-- authenticated user deliberately, NOT gated on approval:read: a plain
-- broker with only policy:write routinely creates the ENDORSEMENT/
-- CANCELLATION version that spawns this chain (policy-version.controller.ts's
-- create()) and needs to see its own submission's progress
-- (list()/findOne() -> withApprovalStatus()) — gating chain visibility
-- behind approval:read (an ADMIN/COMPLIANCE_OFFICER-only grant) would make
-- every requester's own pending version look silently "applied" the moment
-- RLS filters the chain row out from under them. The real access boundary
-- already happened one layer up, at PolicyVersionController's own
-- @RequirePermission('policy','read'/'write') gate. WITH CHECK is equally
-- open for the same "Nest guard is the real creation gate" reason.
-- `app_current_role() = 'SYSTEM_JOB'` was added alongside the user check —
-- found live (42501 row-security violation) once run-engine.ts started
-- creating chains too, for an APPROVAL_GATE step with requiredApprovals >
-- 1: that path runs under SYSTEM_JOB_CONTEXT (a background worker job has
-- no authenticated app_current_user_id()), same reasoning as
-- approval_threshold_rules_rw below.
DROP POLICY IF EXISTS approval_chains_rw ON approval_chains;
CREATE POLICY approval_chains_rw ON approval_chains FOR ALL
  USING (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_user_id() IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

-- Same reasoning as approval_chains_rw above: resolveApprovalThreshold()
-- (policy-lifecycle.ts) runs inside a plain broker's policy:write request
-- and must see every configured rule to resolve correctly — restricting
-- read to approval:read (ADMIN/COMPLIANCE_OFFICER only, unlike sla_config
-- which IS broadly granted) silently starved the resolver down to "zero
-- rules visible" for exactly the population that triggers it, always
-- resolving to the 1-approval default regardless of what was configured.
-- Write stays admin/compliance-only — only the resolver's READ path was
-- ever supposed to be broad.
DROP POLICY IF EXISTS approval_threshold_rules_rw ON approval_threshold_rules;
CREATE POLICY approval_threshold_rules_rw ON approval_threshold_rules FOR ALL
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('approval', 'write') = 'ALL');

-- Portal auth plumbing — SYSTEM_JOB only (the portal module's own access
-- pattern), no internal-staff role has any legitimate reason to browse
-- login tokens or sessions belonging to a Contact.
DROP POLICY IF EXISTS portal_login_tokens_rw ON portal_login_tokens;
CREATE POLICY portal_login_tokens_rw ON portal_login_tokens FOR ALL
  USING (app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS portal_sessions_rw ON portal_sessions;
CREATE POLICY portal_sessions_rw ON portal_sessions FOR ALL
  USING (app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB');

-- =============================================================================
-- notifications — strictly per-recipient, plus an ALL-scope carve-out for
-- the org-wide admin view (/admin/notifications/all —
-- NotificationsController.listAdmin()/resend()). WITH CHECK also gets the
-- carve-out (unlike ai_usage_ledger_rw's read-only one) because resend()
-- needs to flip status on someone else's row back to PENDING — an UPDATE,
-- gated by NestJS's own 'identity'/write RequirePermission one layer up,
-- not a path that can fabricate a brand-new notification pretending to be
-- from the system (INSERT still effectively requires recipientUserId ==
-- self OR SYSTEM_JOB in every real call site — NotificationsService.
-- createNotification()'s own header comment documents this contract).
-- Reuses 'identity' rather than a new 'notification' permission resource,
-- matching every other user-administration surface (users/departments/
-- branches/teams controllers all gate on 'identity' too).
-- =============================================================================

DROP POLICY IF EXISTS notifications_rw ON notifications;
CREATE POLICY notifications_rw ON notifications FOR ALL
  USING (recipient_user_id = app_current_user_id() OR app_max_scope('identity', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (recipient_user_id = app_current_user_id() OR app_max_scope('identity', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

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

-- Same 'integration' ALL-scope tier as integration_connectors_rw above —
-- holds an encrypted Azure client secret (microsoft-sso.controller.ts),
-- not a generic connector, but the access tier is identical.
DROP POLICY IF EXISTS microsoft_sso_configs_rw ON microsoft_sso_configs;
CREATE POLICY microsoft_sso_configs_rw ON microsoft_sso_configs FOR ALL
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

-- =============================================================================
-- semantic_embeddings — Phase 1 RLS gap, fixed here. entityType/entityId is a
-- loose reference (like DocumentLink), not a DB FK, since it spans several
-- target tables — visibility is derived per entityType by joining back to
-- that entity's own scoping rule. Extend the CASE below whenever a new
-- entityType starts being embedded.
-- =============================================================================

DROP POLICY IF EXISTS semantic_embeddings_rw ON semantic_embeddings;
CREATE POLICY semantic_embeddings_rw ON semantic_embeddings FOR ALL
  USING (
    app_current_role() = 'SYSTEM_JOB'
    OR CASE entity_type
      WHEN 'account' THEN EXISTS (SELECT 1 FROM accounts a WHERE a.id = entity_id AND app_can_access_owner('account', 'read', a.owner_id))
      WHEN 'knowledge_article' THEN EXISTS (SELECT 1 FROM knowledge_articles k WHERE k.id = entity_id AND (k.status = 'PUBLISHED' OR k.owner_id = app_current_user_id() OR app_max_scope('knowledge_article', 'write') = 'ALL'))
      ELSE app_max_scope('semantic_embedding', 'read') = 'ALL'
    END
  )
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('semantic_embedding', 'write') = 'ALL');

-- =============================================================================
-- Phase 2 — Case management
-- =============================================================================

DROP POLICY IF EXISTS claims_rw ON claims;
CREATE POLICY claims_rw ON claims FOR ALL
  USING (
    (adjuster_id IS NOT NULL AND app_can_access_owner('claim', 'read', adjuster_id))
    OR EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id
               WHERE p.id = policy_id AND app_can_access_owner('claim', 'read', a.owner_id))
    OR app_current_role() = 'SYSTEM_JOB'
  )
  WITH CHECK (app_max_scope('claim', 'write') IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS claim_status_history_rw ON claim_status_history;
CREATE POLICY claim_status_history_rw ON claim_status_history FOR ALL
  USING (EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id))
  WITH CHECK (app_max_scope('claim', 'write') IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

-- cases: assigned_to_id OR linked account OR team membership (additive grant).
DROP POLICY IF EXISTS cases_rw ON cases;
CREATE POLICY cases_rw ON cases FOR ALL
  USING (
    (assigned_to_id IS NOT NULL AND app_can_access_owner('case', 'read', assigned_to_id))
    OR (account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id
        AND app_can_access_owner('case', 'read', a.owner_id)))
    OR (assigned_team_id IS NOT NULL AND app_is_team_member(assigned_team_id))
    -- The requester always sees their own filed case, even fully
    -- unassigned (no account/assignee/team) — without this branch, such a
    -- case was invisible to its own creator immediately after creation:
    -- Postgres's INSERT...RETURNING also enforces this USING/SELECT
    -- policy on the new row (not just WITH CHECK), so `Case.create()`
    -- failed outright with an RLS violation despite the WITH CHECK below
    -- correctly permitting the write. Discovered live, not theoretical.
    OR (created_by_id IS NOT NULL AND created_by_id = app_current_user_id())
    -- Every branch above requires a non-null owner-bearing column
    -- (assigned_to_id/account_id/assigned_team_id/created_by_id) before
    -- app_can_access_owner's internal ALL-scope check is even reached —
    -- so a fully bare case (no assignee/account/team, created by someone
    -- else) was invisible to ADMIN/COMPLIANCE_OFFICER despite their
    -- case:read ALL grant. Discovered live via the CASE_CLOSURE approval
    -- flow: a compliance officer deciding a complaint they didn't
    -- personally create got a 404. This branch is the unconditional
    -- ALL-scope escape hatch every other ALL-scope-aware policy in this
    -- file already has (e.g. sla_clocks_rw).
    OR app_max_scope('case', 'read') = 'ALL'
    OR app_current_role() = 'SYSTEM_JOB'
  )
  WITH CHECK (app_max_scope('case', 'write') IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS case_watchers_rw ON case_watchers;
CREATE POLICY case_watchers_rw ON case_watchers FOR ALL
  USING (user_id = app_current_user_id() OR app_max_scope('case', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (user_id = app_current_user_id() OR app_current_role() = 'SYSTEM_JOB');

-- SLA/automation config — admin-authored, ALL-scope or SYSTEM_JOB (the
-- breach-scan job needs to read every active clock across the org).
DROP POLICY IF EXISTS sla_policies_rw ON sla_policies;
CREATE POLICY sla_policies_rw ON sla_policies FOR ALL
  USING (app_max_scope('sla_config', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

DROP POLICY IF EXISTS sla_targets_rw ON sla_targets;
CREATE POLICY sla_targets_rw ON sla_targets FOR ALL
  USING (app_max_scope('sla_config', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

-- sla_clocks: readable if the underlying claim/case is; writable only by
-- SYSTEM_JOB (the breach-scan job) or an ALL-scope manual override.
DROP POLICY IF EXISTS sla_clocks_rw ON sla_clocks;
CREATE POLICY sla_clocks_rw ON sla_clocks FOR ALL
  USING (
    app_current_role() = 'SYSTEM_JOB'
    OR app_max_scope('sla_config', 'read') = 'ALL'
    OR (claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_id
          AND ((c.adjuster_id IS NOT NULL AND app_can_access_owner('claim', 'read', c.adjuster_id))
            OR EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id WHERE p.id = c.policy_id AND app_can_access_owner('claim', 'read', a.owner_id)))))
    OR (case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases cs WHERE cs.id = case_id
          AND ((cs.assigned_to_id IS NOT NULL AND app_can_access_owner('case', 'read', cs.assigned_to_id))
            OR (cs.account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = cs.account_id AND app_can_access_owner('case', 'read', a.owner_id))))))
  )
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

DROP POLICY IF EXISTS business_hours_calendars_rw ON business_hours_calendars;
CREATE POLICY business_hours_calendars_rw ON business_hours_calendars FOR ALL
  USING (app_max_scope('sla_config', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

DROP POLICY IF EXISTS business_holidays_rw ON business_holidays;
CREATE POLICY business_holidays_rw ON business_holidays FOR ALL
  USING (app_max_scope('sla_config', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

DROP POLICY IF EXISTS macros_rw ON macros;
CREATE POLICY macros_rw ON macros FOR ALL
  USING (app_current_user_id() IS NOT NULL)
  WITH CHECK (created_by_id = app_current_user_id() OR app_max_scope('macro', 'write') = 'ALL');

DROP POLICY IF EXISTS assignment_rules_rw ON assignment_rules;
CREATE POLICY assignment_rules_rw ON assignment_rules FOR ALL
  USING (app_max_scope('sla_config', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

DROP POLICY IF EXISTS agent_skills_rw ON agent_skills;
CREATE POLICY agent_skills_rw ON agent_skills FOR ALL
  USING (user_id = app_current_user_id() OR app_max_scope('sla_config', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sla_config', 'write') = 'ALL');

-- =============================================================================
-- Phase 2 — Knowledge base & surveys
-- =============================================================================

DROP POLICY IF EXISTS knowledge_categories_select ON knowledge_categories;
CREATE POLICY knowledge_categories_select ON knowledge_categories FOR SELECT
  USING (app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS knowledge_categories_write ON knowledge_categories;
CREATE POLICY knowledge_categories_write ON knowledge_categories FOR ALL
  USING (app_max_scope('knowledge_category', 'write') IS NOT NULL)
  WITH CHECK (app_max_scope('knowledge_category', 'write') IS NOT NULL);

-- PUBLISHED articles are visible to every staff member; DRAFT/IN_REVIEW/
-- ARCHIVED only to the owner or an ALL-scope editor.
DROP POLICY IF EXISTS knowledge_articles_select ON knowledge_articles;
CREATE POLICY knowledge_articles_select ON knowledge_articles FOR SELECT
  USING (
    (status = 'PUBLISHED' AND app_current_user_id() IS NOT NULL)
    OR owner_id = app_current_user_id()
    OR app_max_scope('knowledge_article', 'write') = 'ALL'
  );

DROP POLICY IF EXISTS knowledge_articles_write ON knowledge_articles;
CREATE POLICY knowledge_articles_write ON knowledge_articles FOR ALL
  USING (owner_id = app_current_user_id() OR app_max_scope('knowledge_article', 'write') = 'ALL')
  WITH CHECK (owner_id = app_current_user_id() OR app_max_scope('knowledge_article', 'write') = 'ALL');

DROP POLICY IF EXISTS knowledge_article_versions_select ON knowledge_article_versions;
CREATE POLICY knowledge_article_versions_select ON knowledge_article_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM knowledge_articles a WHERE a.id = article_id
    AND (a.status = 'PUBLISHED' OR a.owner_id = app_current_user_id() OR app_max_scope('knowledge_article', 'write') = 'ALL')
  ));

DROP POLICY IF EXISTS knowledge_article_versions_insert ON knowledge_article_versions;
CREATE POLICY knowledge_article_versions_insert ON knowledge_article_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM knowledge_articles a WHERE a.id = article_id
    AND (a.owner_id = app_current_user_id() OR app_max_scope('knowledge_article', 'write') = 'ALL')
  ));

DROP POLICY IF EXISTS knowledge_article_feedback_rw ON knowledge_article_feedback;
CREATE POLICY knowledge_article_feedback_rw ON knowledge_article_feedback FOR ALL
  USING (
    user_id = app_current_user_id()
    OR EXISTS (SELECT 1 FROM knowledge_articles a WHERE a.id = article_id AND (a.owner_id = app_current_user_id() OR app_max_scope('knowledge_article', 'write') = 'ALL'))
  )
  WITH CHECK (user_id = app_current_user_id());

DROP POLICY IF EXISTS surveys_rw ON surveys;
CREATE POLICY surveys_rw ON surveys FOR ALL
  USING (app_max_scope('survey', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('survey', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

-- Visible to the rated agent (self), the client's account owner, ALL-scope
-- (QA/compliance), and SYSTEM_JOB (the dispatch worker). The actual
-- unauthenticated survey-response WRITE happens via the signed respondToken,
-- verified at the API layer and executed under SYSTEM_JOB_CONTEXT — nothing
-- in Phase 1 needed an unauthenticated-but-verified write path before this.
DROP POLICY IF EXISTS survey_responses_rw ON survey_responses;
CREATE POLICY survey_responses_rw ON survey_responses FOR ALL
  USING (
    agent_id = app_current_user_id()
    OR app_max_scope('survey_response', 'read') = 'ALL'
    OR app_current_role() = 'SYSTEM_JOB'
    OR (account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('account', 'read', a.owner_id)))
  )
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('survey_response', 'write') = 'ALL');

-- =============================================================================
-- Phase 2 — CRM enhancements
-- =============================================================================

DROP POLICY IF EXISTS saved_views_rw ON saved_views;
CREATE POLICY saved_views_rw ON saved_views FOR ALL
  USING (
    owner_id = app_current_user_id()
    OR (visibility = 'TEAM' AND team_id IS NOT NULL AND app_is_team_member(team_id))
    OR (visibility = 'DEPARTMENT' AND app_same_department(owner_id))
    OR visibility = 'ORG'
  )
  WITH CHECK (owner_id = app_current_user_id());

-- Same shape as saved_views_rw above, minus the TEAM tier —
-- DashboardVisibility (schema.prisma) is only PRIVATE|DEPARTMENT|ORG,
-- SavedDashboard has no team_id column to key a TEAM tier off of.
DROP POLICY IF EXISTS saved_dashboards_rw ON saved_dashboards;
CREATE POLICY saved_dashboards_rw ON saved_dashboards FOR ALL
  USING (
    owner_id = app_current_user_id()
    OR (visibility = 'DEPARTMENT' AND app_same_department(owner_id))
    OR visibility = 'ORG'
  )
  WITH CHECK (owner_id = app_current_user_id());

DROP POLICY IF EXISTS sales_quotas_rw ON sales_quotas;
CREATE POLICY sales_quotas_rw ON sales_quotas FOR ALL
  USING (user_id = app_current_user_id() OR app_max_scope('sales_quota', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('sales_quota', 'write') = 'ALL');

-- =============================================================================
-- Phase 2 — Reporting & campaigns
-- =============================================================================

DROP POLICY IF EXISTS scheduled_reports_rw ON scheduled_reports;
CREATE POLICY scheduled_reports_rw ON scheduled_reports FOR ALL
  USING (owner_id = app_current_user_id() OR app_max_scope('scheduled_report', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (owner_id = app_current_user_id() OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS scheduled_report_recipients_rw ON scheduled_report_recipients;
CREATE POLICY scheduled_report_recipients_rw ON scheduled_report_recipients FOR ALL
  USING (
    user_id = app_current_user_id()
    OR app_current_role() = 'SYSTEM_JOB'
    OR EXISTS (SELECT 1 FROM scheduled_reports sr WHERE sr.id = scheduled_report_id AND sr.owner_id = app_current_user_id())
  )
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR EXISTS (SELECT 1 FROM scheduled_reports sr WHERE sr.id = scheduled_report_id AND sr.owner_id = app_current_user_id()));

DROP POLICY IF EXISTS scheduled_report_runs_rw ON scheduled_report_runs;
CREATE POLICY scheduled_report_runs_rw ON scheduled_report_runs FOR ALL
  USING (
    app_current_role() = 'SYSTEM_JOB'
    OR app_max_scope('scheduled_report', 'read') = 'ALL'
    OR (scheduled_report_id IS NOT NULL AND EXISTS (SELECT 1 FROM scheduled_reports sr WHERE sr.id = scheduled_report_id AND sr.owner_id = app_current_user_id()))
  )
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR triggered_by_id = app_current_user_id());

DROP POLICY IF EXISTS scheduled_report_deliveries_rw ON scheduled_report_deliveries;
CREATE POLICY scheduled_report_deliveries_rw ON scheduled_report_deliveries FOR ALL
  USING (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('scheduled_report', 'read') = 'ALL')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS audience_segments_rw ON audience_segments;
CREATE POLICY audience_segments_rw ON audience_segments FOR ALL
  USING (owner_id = app_current_user_id() OR app_max_scope('campaign', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (owner_id = app_current_user_id() OR app_max_scope('campaign', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS campaign_templates_rw ON campaign_templates;
CREATE POLICY campaign_templates_rw ON campaign_templates FOR ALL
  USING (app_max_scope('campaign', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('campaign', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS campaigns_rw ON campaigns;
CREATE POLICY campaigns_rw ON campaigns FOR ALL
  USING (app_max_scope('campaign', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('campaign', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS campaign_variants_rw ON campaign_variants;
CREATE POLICY campaign_variants_rw ON campaign_variants FOR ALL
  USING (app_max_scope('campaign', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('campaign', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS campaign_recipients_rw ON campaign_recipients;
CREATE POLICY campaign_recipients_rw ON campaign_recipients FOR ALL
  USING (app_max_scope('campaign', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('campaign', 'write') = 'ALL');

DROP POLICY IF EXISTS campaign_suppressions_rw ON campaign_suppressions;
CREATE POLICY campaign_suppressions_rw ON campaign_suppressions FOR ALL
  USING (app_max_scope('campaign', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('campaign', 'write') = 'ALL');

-- =============================================================================
-- Phase 2 — Admin & integrations (technical/admin only, same tier as
-- integration_connectors_rw).
-- =============================================================================

DROP POLICY IF EXISTS scim_api_tokens_rw ON scim_api_tokens;
CREATE POLICY scim_api_tokens_rw ON scim_api_tokens FOR ALL
  USING (app_max_scope('identity', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('identity', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS webhook_subscriptions_rw ON webhook_subscriptions;
CREATE POLICY webhook_subscriptions_rw ON webhook_subscriptions FOR ALL
  USING (app_max_scope('integration', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_max_scope('integration', 'write') = 'ALL' OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS webhook_deliveries_rw ON webhook_deliveries;
CREATE POLICY webhook_deliveries_rw ON webhook_deliveries FOR ALL
  USING (app_max_scope('integration', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('integration', 'write') = 'ALL');

DROP POLICY IF EXISTS integration_oauth_credentials_rw ON integration_oauth_credentials;
CREATE POLICY integration_oauth_credentials_rw ON integration_oauth_credentials FOR ALL
  USING (app_max_scope('integration', 'read') = 'ALL' OR app_current_role() = 'SYSTEM_JOB')
  WITH CHECK (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('integration', 'write') = 'ALL');

-- =============================================================================
-- Phase 2 — Customer loyalty. Both tables scope through the enrolled
-- Account's owner_id, same join pattern claims_rw uses through
-- policies->accounts — a broker sees/manages loyalty for accounts they own,
-- a department head sees their department's, ADMIN/SYSTEM_JOB see all.
-- =============================================================================

DROP POLICY IF EXISTS loyalty_accounts_rw ON loyalty_accounts;
CREATE POLICY loyalty_accounts_rw ON loyalty_accounts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND app_can_access_owner('loyalty', 'read', a.owner_id))
    OR app_current_role() = 'SYSTEM_JOB'
  )
  WITH CHECK (app_max_scope('loyalty', 'write') IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

DROP POLICY IF EXISTS loyalty_transactions_rw ON loyalty_transactions;
CREATE POLICY loyalty_transactions_rw ON loyalty_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM loyalty_accounts la JOIN accounts a ON a.id = la.account_id
      WHERE la.id = loyalty_account_id AND app_can_access_owner('loyalty', 'read', a.owner_id)
    )
    OR app_current_role() = 'SYSTEM_JOB'
  )
  WITH CHECK (app_max_scope('loyalty', 'write') IS NOT NULL OR app_current_role() = 'SYSTEM_JOB');

-- =============================================================================
-- Phase 3 — Workflow engine (AutomationRule.steps multi-step runs).
-- automation_run_states scopes through whichever Case/Claim it's running
-- against — same join-through-entity shape as sla_clocks_rw, plus an
-- 'approval'-oversight branch (a compliance officer deciding an
-- APPROVAL_GATE step needs to see the run it belongs to, regardless of
-- whether they'd otherwise have case/claim visibility). automation_rules
-- itself is deliberately NOT enabled here — see
-- automation-rules.controller.ts's header comment, same RLS-free "config
-- tier" as carriers/pipelines/custom_field_definitions.
-- =============================================================================

-- Same named-approver reasoning as approvals_rw above: a run whose gate
-- froze `context.approverAllowlist` must be readable/updatable by exactly
-- those people (directly, or standing in via an active
-- approval_delegations row) even without case/claim visibility or
-- approval:read/write ALL scope — otherwise AutomationRunStatesController.
-- decide()'s own findUnique() 404s before its allowlist check ever runs,
-- and its closing automationRunState.update() (advancing currentStepIndex)
-- would be silently rejected by this same policy's WITH CHECK.
DROP POLICY IF EXISTS automation_run_states_rw ON automation_run_states;
CREATE POLICY automation_run_states_rw ON automation_run_states FOR ALL
  USING (
    app_current_role() = 'SYSTEM_JOB'
    OR app_max_scope('approval', 'read') = 'ALL'
    OR (entity_type = 'CASE' AND EXISTS (SELECT 1 FROM cases cs WHERE cs.id = entity_id
          AND ((cs.assigned_to_id IS NOT NULL AND app_can_access_owner('case', 'read', cs.assigned_to_id))
            OR (cs.account_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = cs.account_id AND app_can_access_owner('case', 'read', a.owner_id))))))
    OR (entity_type = 'CLAIM' AND EXISTS (SELECT 1 FROM claims c WHERE c.id = entity_id
          AND ((c.adjuster_id IS NOT NULL AND app_can_access_owner('claim', 'read', c.adjuster_id))
            OR EXISTS (SELECT 1 FROM policies p JOIN accounts a ON a.id = p.account_id WHERE p.id = c.policy_id AND app_can_access_owner('claim', 'read', a.owner_id)))))
    OR (
      context -> 'approverAllowlist' ? app_current_user_id()::text
      OR EXISTS (
        SELECT 1 FROM approval_delegations ad
        WHERE ad.delegate_id = app_current_user_id()
          AND now() BETWEEN ad.starts_at AND ad.ends_at
          AND context -> 'approverAllowlist' ? ad.delegator_id::text
      )
    )
  )
  WITH CHECK (
    app_current_role() = 'SYSTEM_JOB'
    OR app_max_scope('approval', 'write') = 'ALL'
    OR (
      context -> 'approverAllowlist' ? app_current_user_id()::text
      OR EXISTS (
        SELECT 1 FROM approval_delegations ad
        WHERE ad.delegate_id = app_current_user_id()
          AND now() BETWEEN ad.starts_at AND ad.ends_at
          AND context -> 'approverAllowlist' ? ad.delegator_id::text
      )
    )
  );
