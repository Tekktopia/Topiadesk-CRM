-- Territories / books of business.
--
-- Account ownership already exists per-record; this adds the durable
-- STRUCTURE around it — a named book, who leads it, who works it, and a
-- hierarchy so a branch rolls up into a region. Without it a "book" is only
-- whichever accounts happen to share an owner today, which evaporates the
-- moment that person leaves.

DO $$ BEGIN
  CREATE TYPE "TerritoryType" AS ENUM ('GEOGRAPHIC', 'INDUSTRY', 'PRODUCT', 'NAMED_ACCOUNTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "territories" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        "TerritoryType" NOT NULL DEFAULT 'GEOGRAPHIC',
  "parent_id"   UUID REFERENCES "territories"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "manager_id"  UUID REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "territories_name_key" ON "territories" ("name");
CREATE INDEX IF NOT EXISTS "territories_parent_id_idx" ON "territories" ("parent_id");

CREATE TABLE IF NOT EXISTS "territory_members" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "territory_id" UUID NOT NULL REFERENCES "territories"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "user_id"      UUID NOT NULL REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "territory_members_territory_id_user_id_key"
  ON "territory_members" ("territory_id", "user_id");
CREATE INDEX IF NOT EXISTS "territory_members_user_id_idx" ON "territory_members" ("user_id");

-- Nullable: a client can exist before anyone decides whose book it is, and
-- requiring a territory at creation would block that.
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "territory_id" UUID
  REFERENCES "territories"("id") ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "accounts_territory_id_idx" ON "accounts" ("territory_id");

ALTER TABLE "territories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territory_members" ENABLE ROW LEVEL SECURITY;

-- Ownership/grants to match every sibling table. Without the app_runtime
-- grants the tables exist, RLS is enabled, and every query still fails with
-- "permission denied" — the exact trap the compliance tables hit earlier.
DO $$
DECLARE target_schema TEXT := current_schema();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    EXECUTE format('ALTER TABLE %I.territories OWNER TO app_migrator', target_schema);
    EXECUTE format('ALTER TABLE %I.territory_members OWNER TO app_migrator', target_schema);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.territories TO app_runtime', target_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.territory_members TO app_runtime', target_schema);
  END IF;
END $$;
