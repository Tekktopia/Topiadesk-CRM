-- Microsoft 365 (Graph) calendar + mail sync.
--
-- Per-USER rather than per-tenant: Graph tokens are delegated, so each
-- producer consents for their own mailbox. Tokens reuse the existing
-- AES-256-GCM helper (oauth-token-crypto.ts) rather than a second crypto path.

DO $$ BEGIN
  CREATE TYPE "GraphSyncKind" AS ENUM ('CALENDAR', 'MAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GraphConnectionStatus" AS ENUM ('CONNECTED', 'NEEDS_RECONSENT', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "microsoft_graph_connections" (
  "id"                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                 UUID NOT NULL UNIQUE REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "microsoft_user_id"       TEXT NOT NULL,
  "microsoft_upn"           TEXT NOT NULL,
  "encrypted_access_token"  TEXT NOT NULL,
  "encrypted_refresh_token" TEXT,
  "expires_at"              TIMESTAMPTZ(6),
  "scopes"                  TEXT[] NOT NULL DEFAULT '{}',
  "calendar_sync_enabled"   BOOLEAN NOT NULL DEFAULT true,
  "mail_sync_enabled"       BOOLEAN NOT NULL DEFAULT false,
  "status"                  "GraphConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "last_synced_at"          TIMESTAMPTZ(6),
  "last_sync_error"         TEXT,
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMPTZ(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS "graph_sync_states" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL REFERENCES "microsoft_graph_connections"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "kind"          "GraphSyncKind" NOT NULL,
  "delta_link"    TEXT,
  "last_run_at"   TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "graph_sync_states_connection_id_kind_key"
  ON "graph_sync_states" ("connection_id", "kind");

CREATE TABLE IF NOT EXISTS "graph_subscriptions" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id"   UUID NOT NULL REFERENCES "microsoft_graph_connections"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "kind"            "GraphSyncKind" NOT NULL,
  "subscription_id" TEXT NOT NULL UNIQUE,
  "client_state"    TEXT NOT NULL,
  "expires_at"      TIMESTAMPTZ(6) NOT NULL,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "graph_subscriptions_connection_id_kind_key"
  ON "graph_subscriptions" ("connection_id", "kind");
-- Renewal job reads this; a missed renewal silently stops push updates.
CREATE INDEX IF NOT EXISTS "graph_subscriptions_expires_at_idx" ON "graph_subscriptions" ("expires_at");

ALTER TABLE "microsoft_graph_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graph_sync_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graph_subscriptions" ENABLE ROW LEVEL SECURITY;

-- Ownership/grants to match every sibling table. Without the app_runtime
-- grants the tables exist, RLS is enabled, and every query fails with
-- "permission denied" — the trap the compliance tables hit earlier.
DO $$
DECLARE target_schema TEXT := current_schema();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    EXECUTE format('ALTER TABLE %I.microsoft_graph_connections OWNER TO app_migrator', target_schema);
    EXECUTE format('ALTER TABLE %I.graph_sync_states OWNER TO app_migrator', target_schema);
    EXECUTE format('ALTER TABLE %I.graph_subscriptions OWNER TO app_migrator', target_schema);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.microsoft_graph_connections TO app_runtime', target_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.graph_sync_states TO app_runtime', target_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.graph_subscriptions TO app_runtime', target_schema);
  END IF;
END $$;
