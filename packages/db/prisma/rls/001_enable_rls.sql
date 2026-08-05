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
    'saved_dashboards'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
