-- Premium aging cannot be a Prisma `@default` generated column (Postgres
-- generated columns must be IMMUTABLE and CURRENT_DATE is not), so it's a
-- materialized view refreshed on a schedule by the worker (see
-- apps/worker/src/jobs/premium-aging/refresh-aging.job.ts, Batch 1 Agent C).
--
-- IMPORTANT: materialized views do NOT support RLS in Postgres. This view is
-- deliberately kept at the finest grain (per-premium) and NEVER queried
-- directly by the API — apps only ever read through
-- `premium_aging_summary_scoped`, a plain (non-materialized) view that joins
-- back to policies/accounts and therefore inherits their RLS policies via
-- the querying role (app_runtime), regardless of who owns the view.

CREATE MATERIALIZED VIEW IF NOT EXISTS premium_aging_summary AS
SELECT
  pr.id AS premium_id,
  pr.policy_id,
  pr.gross_premium,
  pr.paid_amount,
  (pr.gross_premium - pr.paid_amount) AS outstanding_amount,
  pr.due_date,
  pr.status,
  GREATEST(0, (CURRENT_DATE - pr.due_date))::int AS days_overdue,
  CASE
    WHEN pr.status = 'PAID' THEN 'CURRENT'
    WHEN (CURRENT_DATE - pr.due_date) <= 0 THEN 'CURRENT'
    WHEN (CURRENT_DATE - pr.due_date) <= 30 THEN '1_30'
    WHEN (CURRENT_DATE - pr.due_date) <= 60 THEN '31_60'
    WHEN (CURRENT_DATE - pr.due_date) <= 90 THEN '61_90'
    ELSE '90_PLUS'
  END AS aging_bucket,
  now() AS refreshed_at
FROM premiums pr
WHERE pr.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE');

CREATE UNIQUE INDEX IF NOT EXISTS premium_aging_summary_premium_id_idx
  ON premium_aging_summary (premium_id);
CREATE INDEX IF NOT EXISTS premium_aging_summary_policy_id_idx
  ON premium_aging_summary (policy_id);

-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires the unique index above and
-- avoids locking the view against concurrent reads during refresh.
--
-- SECURITY DEFINER (+ fixed search_path, same defensive reasoning as
-- app_max_scope() in 002_policies.sql): REFRESH MATERIALIZED VIEW requires
-- being the owner of the matview, full stop — there is no partial GRANT for
-- it. The matview is owned by app_migrator (the schema owner, since
-- apply-sql.ts runs as app_migrator); app_runtime (what api/worker actually
-- connect as, per packages/db/src/rls-context.ts's SYSTEM_JOB principal)
-- is deliberately NOT the owner and NOT BYPASSRLS. Without SECURITY
-- DEFINER this function is uncallable by app_runtime at all — confirmed
-- empirically: `must be owner of materialized view premium_aging_summary`
-- (error 42501) when backend/worker's premium-aging-refresh job called it.
CREATE OR REPLACE FUNCTION refresh_premium_aging_summary() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY premium_aging_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE VIEW premium_aging_summary_scoped AS
SELECT pas.*
FROM premium_aging_summary pas
JOIN policies p ON p.id = pas.policy_id
JOIN accounts a ON a.id = p.account_id
WHERE app_can_access_owner('policy', 'read', a.owner_id);
