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
$$ LANGUAGE plpgsql;

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
    'departments', 'branches', 'ip_whitelist_entries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_trigger ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change()',
      t, t
    );
  END LOOP;
END $$;
