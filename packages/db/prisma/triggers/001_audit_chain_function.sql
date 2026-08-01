-- Hash chain computed in Postgres (a BEFORE INSERT trigger), not in
-- application code — this is deliberate: a single place computing hashes
-- eliminates the "app's canonical-JSON serializer disagrees with the
-- verification tool" class of false-tamper-positive.
--
-- Concurrency: the chain is partitioned into 8 lanes by
-- hashtext(entity_type || entity_id) so unrelated entities don't serialize
-- against each other. Each lane is protected by its own
-- pg_advisory_xact_lock (auto-released at COMMIT), giving 8-way write
-- concurrency instead of one global bottleneck across the whole app.
--
-- Table is structurally append-only: no UPDATE/DELETE policy exists in
-- 002_policies.sql, and privileges are revoked below in addition (defense
-- in depth — either mechanism alone would already block tampering).

CREATE OR REPLACE FUNCTION audit_chain_before_insert() RETURNS trigger AS $$
DECLARE
  v_lane int;
  v_prev_hash char(64);
  v_payload text;
BEGIN
  v_lane := abs(hashtext(NEW.entity_type || ':' || NEW.entity_id::text)) % 8;
  NEW.chain_lane := v_lane;

  -- Serializes writers within this lane only; released automatically at COMMIT.
  PERFORM pg_advisory_xact_lock(hashtext('topiadesk_audit_chain'), v_lane);

  SELECT current_hash INTO v_prev_hash
  FROM audit_log
  WHERE chain_lane = v_lane
  ORDER BY id DESC
  LIMIT 1;

  NEW.prev_hash := v_prev_hash;

  IF NEW.actor_user_id IS NULL THEN
    NEW.actor_user_id := app_current_user_id();
  END IF;

  -- Explicit, ordered field list (not to_jsonb(NEW)) so serialization is
  -- deterministic and independent of physical column order.
  v_payload := jsonb_build_object(
    'id', NEW.id,
    'entity_type', NEW.entity_type,
    'entity_id', NEW.entity_id,
    'action', NEW.action,
    'actor_user_id', NEW.actor_user_id,
    'actor_system_job', NEW.actor_system_job,
    'actor_ip', NEW.actor_ip,
    'changed_fields', NEW.changed_fields,
    'chain_lane', NEW.chain_lane,
    'created_at', NEW.created_at
  )::text;

  NEW.current_hash := encode(digest(COALESCE(v_prev_hash, '') || v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_chain_trigger ON audit_log;
CREATE TRIGGER audit_log_chain_trigger
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_chain_before_insert();

-- app_migrator (table owner) keeps full rights for migrations/admin tooling;
-- app_runtime (what api/worker connect as) may only ever INSERT.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime;
