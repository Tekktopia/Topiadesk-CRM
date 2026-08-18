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
    -- Policy depth — Coverages/Participants/Assets. Same child-of-Policy
    -- shape as renewal_schedules/premiums above — no dedicated resource,
    -- reuses 'policy' scoping (see 002_policies.sql).
    'policy_coverages', 'policy_participants', 'policy_assets',
    -- Producer/commission model. 'producers' itself is deliberately NOT
    -- enabled here — an org-wide roster of who earns commission, same
    -- RLS-free "config tier" as carriers/pipelines/automation_rules (see
    -- that comment further down). ProducerPolicyAssignment/ProducerCommission
    -- hold real per-policy $ data and scope through their parent Policy,
    -- same child-of-account shape as account_sla_overrides/sites below.
    'producer_policy_assignments', 'producer_commissions',
    'documents', 'document_versions', 'document_links',
    'approvals', 'notifications', 'ai_usage_ledger',
    -- CRM AI copilot conversation history — self-only, see
    -- ai_chat_sessions_rw/ai_chat_messages_rw (002_policies.sql).
    'ai_chat_sessions', 'ai_chat_messages',
    'audit_log', 'integration_connectors', 'sync_jobs', 'integration_logs',
    -- Phase 1 gap, found via research: semantic_embeddings had zero RLS
    -- protection despite holding potentially OWN-scoped content chunks —
    -- fixed here alongside the first real consumers of the table (Phase 2
    -- AI search), never shipped separately.
    'semantic_embeddings',
    -- Phase 2 — case management
    'claims', 'claim_status_history', 'cases', 'case_watchers',
    'sla_policies', 'sla_targets', 'sla_clocks',
    'business_hours_calendars', 'business_holidays',
    'macros', 'assignment_rules', 'agent_skills',
    -- Phase 2 — knowledge base & surveys
    'knowledge_categories', 'knowledge_articles', 'knowledge_article_versions',
    'knowledge_article_feedback', 'surveys', 'survey_responses',
    -- Phase 2 — CRM enhancements
    'saved_views', 'sales_quotas',
    -- Phase 2 — reporting & campaigns
    'scheduled_reports', 'scheduled_report_recipients', 'scheduled_report_runs',
    'scheduled_report_deliveries', 'audience_segments', 'campaign_templates',
    'campaigns', 'campaign_variants', 'campaign_recipients', 'campaign_suppressions',
    -- Phase 2 — admin & integrations
    'scim_api_tokens', 'webhook_subscriptions', 'webhook_deliveries',
    'integration_oauth_credentials',
    -- Phase 2 — customer loyalty
    'loyalty_accounts', 'loyalty_transactions',
    -- Phase 3 — workflow engine. Unlike automation_rules itself
    -- (deliberately RLS-free — see automation-rules.controller.ts's header
    -- comment, same "config tier" as carriers/pipelines), a run STATE row
    -- holds per-Case/Claim execution progress, not flat org-wide config —
    -- it needs the same visibility scoping as the entity it's running
    -- against.
    'automation_run_states',
    -- Phase 4 — custom dashboards. Pre-existing gap, found alongside
    -- building real user-owned CRUD on top of it: `saved_dashboards` had
    -- zero RLS despite `ownerId`/`visibility` columns designed for exactly
    -- this — harmless while only 4 ADMIN-seeded ORG rows existed behind
    -- read-only routes, a real hole once users can create PRIVATE ones.
    'saved_dashboards',
    -- Phase 5 — account-level overrides/extensions, all child-of-account
    -- tables inheriting the parent account's owner-based scoping the same
    -- way account_relationships/contacts already do.
    'account_sla_overrides', 'sites',
    -- Phase 5 — multi-level policy-version approval chains.
    'approval_chains', 'approval_threshold_rules',
    -- Phase 6 — customer portal auth plumbing. Not touched by the portal
    -- itself (which runs under SYSTEM_JOB_CONTEXT, bypassing RLS, with
    -- manual contactId/accountId filters as the real boundary — see
    -- portal.module.ts's header comment) — this RLS is purely defense in
    -- depth against a regular internal-staff session ever browsing another
    -- contact's login tokens/sessions, which no legitimate app feature
    -- needs.
    'portal_login_tokens', 'portal_sessions',
    -- Enterprise pass — identity/users. Previously the one org-wide-visible
    -- table with no RLS at all that ALSO has real per-row 'owner' semantics
    -- (a User's own department/branch) worth scoping — unlike roles/
    -- departments/branches, which stay genuinely unprotected reference
    -- data. See users_rw in 002_policies.sql and
    -- rls-context.middleware.ts's header comment for the one caller
    -- (the bootstrap identity lookup) that must explicitly bypass this.
    'users',
    -- Per-tenant Microsoft 365 SSO config — holds an encrypted Azure client
    -- secret, same 'integration' ALL-scope tier as integration_connectors.
    'microsoft_sso_configs',
    -- Approval Delegation — "while I'm out, my named-approver gates also
    -- decide for X" (see approval_delegations_rw, 002_policies.sql).
    'approval_delegations',
    -- NDPR/GDPR Data Subject Requests — child-of-contact (which is itself
    -- child-of-account), same inherited-scoping shape as
    -- account_sla_overrides/sites above (see data_subject_requests_rw,
    -- 002_policies.sql).
    'data_subject_requests',
    -- General-purpose consent log — same child-of-contact-of-account shape
    -- as data_subject_requests above (see consent_records_rw,
    -- 002_policies.sql).
    'consent_records',
    -- E-signature requests — child-of-policy-of-account, same inherited
    -- scoping shape as policy_versions above (see signature_requests_rw,
    -- 002_policies.sql).
    'signature_requests'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
