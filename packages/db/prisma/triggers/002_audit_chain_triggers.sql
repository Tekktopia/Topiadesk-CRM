-- Generic AFTER INSERT/UPDATE/DELETE capture, attached to every
-- compliance-relevant table. This is deliberately DB-level rather than
-- solely relying on a NestJS interceptor: a trigger can never be forgotten
-- by a future module, whereas an app-layer-only audit hook can (and, on
-- long-lived systems, eventually will) miss a new mutation path. Each row
-- this inserts flows straight into audit_log, so it's hash-chained by
-- 001_audit_chain_function.sql automatically.
--
-- apps/api's AuditService is for the complementary case: actions with no
-- corresponding row mutation (LOGIN, LOGIN_FAILED, EXPORT, VIEW_SENSITIVE).

CREATE OR REPLACE FUNCTION audit_capture_row_change() RETURNS trigger AS $$
DECLARE
  v_entity_id uuid;
  v_action text;
  v_changed jsonb;
  v_actor_ip text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id;
    v_action := 'CREATE';
    v_changed := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id;
    v_action := 'UPDATE';
    SELECT COALESCE(jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
    INTO v_changed
    FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
    JOIN jsonb_each(to_jsonb(NEW)) AS n(key, value) USING (key)
    WHERE o.value IS DISTINCT FROM n.value;
  ELSE
    v_entity_id := OLD.id;
    v_action := 'DELETE';
    v_changed := to_jsonb(OLD);
  END IF;

  v_actor_ip := NULLIF(current_setting('app.current_client_ip', true), '');

  INSERT INTO audit_log (entity_type, entity_id, action, actor_ip, changed_fields, chain_lane, current_hash)
  VALUES (TG_TABLE_NAME, v_entity_id, v_action::"AuditAction", v_actor_ip, v_changed, 0, '');

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
-- Fixed search_path — see 001_audit_chain_function.sql's identical comment.
-- This body references `audit_log` and the "AuditAction" enum unqualified;
-- no pgcrypto call here, but pinning stays consistent with the other 2
-- trigger functions rather than being the one exception.
SET search_path = public;

-- NOTE: role_permissions and user_roles (composite PK, no `id` column) and
-- org_settings (PK column is `key`, not `id`) are deliberately excluded —
-- this generic function assumes NEW.id/OLD.id exist. Role/permission grant
-- changes are more meaningful as an explicit PERMISSION_CHANGE event anyway
-- (semantic "who granted what role to whom", not a raw junction-row diff) —
-- Batch 1's Identity module calls AuditService.recordEvent() for those, and
-- for org_settings writes, at the point of change rather than relying on
-- this trigger.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'account_relationships', 'contacts', 'carriers',
    'leads', 'opportunities', 'opportunity_market_submissions',
    'policies', 'policy_versions', 'premiums', 'renewal_schedules',
    'documents', 'document_versions', 'document_links',
    'approvals', 'automation_rules', 'integration_connectors',
    'users', 'roles',
    'departments', 'branches', 'ip_whitelist_entries',
    -- teams/team_members were a real gap — every other admin-managed
    -- org-structure table above already had audit coverage, these two
    -- silently didn't (found live during the admin-CRUD audit).
    'teams', 'team_members',
    -- Phase 2 — case management. sla_clocks and case_watchers excluded on
    -- purpose: high-frequency derived/operational state whose meaningful
    -- moments (breachedAt/escalatedAt) are already durable on the row
    -- itself — chaining every pause/resume would bloat audit_log with
    -- noise that isn't itself a compliance-relevant business record.
    'claims', 'claim_status_history', 'cases',
    'sla_policies', 'sla_targets', 'business_hours_calendars', 'business_holidays',
    'macros', 'assignment_rules', 'agent_skills',
    -- Business rule engine — admin-editable config that reshapes required/
    -- visible fields org-wide, same compliance tier as custom_field_definitions
    -- below (both are structural config changes, not personal preference).
    'business_rules',
    -- Phase 2 — knowledge base & surveys. knowledge_article_feedback
    -- excluded (high-volume, low compliance value, same reasoning as
    -- notifications). survey_responses IS included on purpose — this is
    -- what makes a revised CSAT/NPS score's full history recoverable
    -- instead of silently overwritten (the cited Freshdesk gap).
    'knowledge_categories', 'knowledge_articles', 'knowledge_article_versions',
    'surveys', 'survey_responses',
    -- Phase 2 — CRM enhancements. saved_views excluded (personal
    -- preference churn, same tier as notifications).
    'custom_field_definitions', 'sales_quotas',
    -- Phase 2 — reporting & campaigns. Delivery/run logs excluded
    -- (operational, same tier as sync_jobs/integration_logs today).
    'scheduled_reports', 'audience_segments', 'campaign_templates',
    'campaigns', 'campaign_variants',
    -- Phase 2 — admin & integrations. webhook_deliveries excluded
    -- (operational log, same tier as integration_logs).
    'scim_api_tokens', 'webhook_subscriptions', 'integration_oauth_credentials',
    -- Phase 2 — customer loyalty. Both tables included: a points ledger is
    -- exactly the kind of record that must be reconstructable/auditable,
    -- same reasoning as survey_responses above.
    'loyalty_accounts', 'loyalty_transactions',
    -- Phase 3 — workflow engine. A run's status/step progression is a real
    -- compliance-relevant record once it can pause on an approval gate,
    -- same tier as approvals itself.
    'automation_run_states'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_trigger ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change()',
      t, t
    );
  END LOOP;
END $$;
