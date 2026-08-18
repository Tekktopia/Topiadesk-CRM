-- Compliance obligations register + regulatory returns calendar.
--
-- Two tables on purpose: ComplianceObligation is the recurring RULE, and
-- ComplianceFiling is each due OCCURRENCE. A regulator's question is always
-- "prove you filed Q1" — that needs a durable row per period with its own
-- date, submitter and receipt, not a status column overwritten each cycle.

DO $$ BEGIN
  CREATE TYPE "ComplianceRegulator" AS ENUM ('NAICOM', 'NDPC', 'SCUML_NFIU', 'FIRS', 'CBN', 'INTERNAL', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceFrequency" AS ENUM ('ONE_OFF', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceFilingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Evidence attaches through the existing document_links machinery rather
-- than a dedicated column, so a filing can carry several artefacts and
-- inherits retention/virus-scan/versioning for free.
DO $$ BEGIN
  ALTER TYPE "DocumentEntityType" ADD VALUE 'COMPLIANCE_FILING';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "compliance_obligations" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "regulator"      "ComplianceRegulator" NOT NULL,
  "reference"      TEXT,
  "frequency"      "ComplianceFrequency" NOT NULL,
  "lead_time_days" INTEGER NOT NULL DEFAULT 14,
  "owner_id"       UUID REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMPTZ(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "compliance_obligations_regulator_idx" ON "compliance_obligations" ("regulator");
CREATE INDEX IF NOT EXISTS "compliance_obligations_owner_id_idx" ON "compliance_obligations" ("owner_id");

CREATE TABLE IF NOT EXISTS "compliance_filings" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "obligation_id"    UUID NOT NULL REFERENCES "compliance_obligations"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "period_label"     TEXT NOT NULL,
  "due_date"         DATE NOT NULL,
  "status"           "ComplianceFilingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "submitted_at"     TIMESTAMPTZ(6),
  "submitted_by_id"  UUID REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "reference"        TEXT,
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL
);

-- Makes occurrence generation idempotent: a scheduler can run twice without
-- creating a duplicate period.
CREATE UNIQUE INDEX IF NOT EXISTS "compliance_filings_obligation_id_period_label_key"
  ON "compliance_filings" ("obligation_id", "period_label");
CREATE INDEX IF NOT EXISTS "compliance_filings_due_date_idx" ON "compliance_filings" ("due_date");
CREATE INDEX IF NOT EXISTS "compliance_filings_status_idx" ON "compliance_filings" ("status");

ALTER TABLE "compliance_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_filings" ENABLE ROW LEVEL SECURITY;

-- Ownership/grants to match every sibling table. NOT optional: without the
-- app_runtime grants the tables exist, RLS is enabled, and every query still
-- fails with "permission denied for table compliance_obligations". Newly
-- provisioned tenants run this migration too, so it has to live here rather
-- than in a one-off fixup.
DO $$
DECLARE target_schema TEXT := current_schema();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    EXECUTE format('ALTER TABLE %I.compliance_obligations OWNER TO app_migrator', target_schema);
    EXECUTE format('ALTER TABLE %I.compliance_filings OWNER TO app_migrator', target_schema);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.compliance_obligations TO app_runtime', target_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.compliance_filings TO app_runtime', target_schema);
  END IF;
END $$;
