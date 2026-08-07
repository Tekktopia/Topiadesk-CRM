-- Periodic checkpoint (called every ~5 min by the worker — see
-- apps/worker/src/jobs/audit-checkpoint/) anchoring all 8 lanes' current
-- head hashes into one row. A nightly verification job walks each lane from
-- genesis, recomputing hashes, and cross-checks against checkpoints —
-- without this, "tamper-evident" is a claim nobody ever actually checks.

CREATE OR REPLACE FUNCTION create_audit_checkpoint() RETURNS uuid AS $$
DECLARE
  v_lane_hashes jsonb;
  v_anchor_hash char(64);
  v_id uuid;
BEGIN
  SELECT COALESCE(jsonb_object_agg(lane::text, head_hash), '{}'::jsonb)
  INTO v_lane_hashes
  FROM (
    SELECT DISTINCT ON (chain_lane) chain_lane AS lane, current_hash AS head_hash
    FROM audit_log
    ORDER BY chain_lane, id DESC
  ) heads;

  v_anchor_hash := encode(digest(v_lane_hashes::text, 'sha256'), 'hex');

  INSERT INTO audit_checkpoints (id, checkpoint_at, lane_hashes, anchor_hash)
  VALUES (gen_random_uuid(), now(), v_lane_hashes, v_anchor_hash)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql
-- Fixed search_path — see 001_audit_chain_function.sql's identical comment.
-- Calls digest() (pgcrypto) and gen_random_uuid() (pgcrypto), both in
-- `public`, plus references audit_log/audit_checkpoints unqualified.
SET search_path = public;
