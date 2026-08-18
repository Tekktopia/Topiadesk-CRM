-- Per-tenant outbound mail settings, admin-managed.
--
-- The SMTP_* env vars are process-wide and identical for every tenant, so
-- changing provider meant editing .env and redeploying — and made it
-- impossible for one firm to use Microsoft 365 while another uses Brevo.

DO $$ BEGIN
  CREATE TYPE "MailProvider" AS ENUM
    ('BREVO', 'SENDGRID', 'MAILJET', 'MICROSOFT365', 'GOOGLE_WORKSPACE', 'AMAZON_SES', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "mail_settings" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider"           "MailProvider" NOT NULL DEFAULT 'CUSTOM',
  "host"               TEXT NOT NULL,
  "port"               INTEGER NOT NULL,
  "secure"             BOOLEAN NOT NULL DEFAULT false,
  "username"           TEXT,
  -- AES-256-GCM ciphertext (iv:authTag:ciphertext), never plaintext.
  "encrypted_password" TEXT,
  "from_name"          TEXT NOT NULL,
  "from_email"         TEXT NOT NULL,
  "reply_to_email"     TEXT,
  "is_active"          BOOLEAN NOT NULL DEFAULT false,
  "last_tested_at"     TIMESTAMPTZ(6),
  "last_test_error"    TEXT,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMPTZ(6) NOT NULL
);

ALTER TABLE "mail_settings" ENABLE ROW LEVEL SECURITY;

-- Ownership/grants to match every sibling table. Without the app_runtime
-- grants the table exists, RLS is enabled, and every query fails with
-- "permission denied" — the trap the compliance tables hit.
DO $$
DECLARE target_schema TEXT := current_schema();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    EXECUTE format('ALTER TABLE %I.mail_settings OWNER TO app_migrator', target_schema);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.mail_settings TO app_runtime', target_schema);
  END IF;
END $$;
