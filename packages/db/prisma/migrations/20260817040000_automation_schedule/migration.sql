-- Makes AutomationTriggerType.SCHEDULE actually mean something.
--
-- SCHEDULE has been a value in the enum since the automation module was
-- written, but automation_rules had no column saying WHEN a scheduled rule
-- should fire and no job ever queried for such rules. Rules created on
-- /admin/automations were saved, listed, badged Active — and never ran.
--
-- These columns supply the cadence (cron + IANA timezone), the precomputed
-- next due instant the scan job selects on, and last-run observability so a
-- rule that has quietly stopped working is visible on the list rather than
-- only in a log nobody opens.

ALTER TABLE "automation_rules"
  ADD COLUMN IF NOT EXISTS "schedule_cron"     TEXT,
  ADD COLUMN IF NOT EXISTS "schedule_timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "next_run_at"       TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_run_at"       TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_run_status"   TEXT,
  ADD COLUMN IF NOT EXISTS "last_run_error"    TEXT,
  ADD COLUMN IF NOT EXISTS "last_match_count"  INTEGER;

-- The scan job's hot path: "which rules are due right now". Without this it
-- is a sequential scan of every rule on every wake-up, in every tenant.
CREATE INDEX IF NOT EXISTS "automation_rules_trigger_active_status_next_run_idx"
  ON "automation_rules" ("trigger_type", "is_active", "status", "next_run_at");

-- Any SCHEDULE rows that already exist were created against a build where
-- SCHEDULE did nothing, so they carry no cadence and cannot be given a
-- sensible default (guessing one would start firing actions their author
-- never saw run). They are deactivated instead, so an admin re-publishes
-- them deliberately after setting a schedule — visible and reversible,
-- rather than either silently dead or silently live.
UPDATE "automation_rules"
   SET "is_active" = false,
       "last_run_status" = 'SKIPPED',
       "last_run_error" = 'This rule was created before scheduled automation could run. Set how often it should run, then switch it back on.'
 WHERE "trigger_type" = 'SCHEDULE'
   AND "schedule_cron" IS NULL
   AND "is_active" = true;
