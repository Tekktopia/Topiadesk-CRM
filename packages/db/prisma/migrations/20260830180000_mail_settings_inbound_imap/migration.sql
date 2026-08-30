-- Inbound (IMAP polling) mail settings — independent of the existing
-- outbound SMTP fields on this same row. See schema.prisma's comment on
-- MailSettings for why these live here rather than a separate table.

ALTER TABLE "mail_settings"
  ADD COLUMN "inbound_host" TEXT,
  ADD COLUMN "inbound_port" INTEGER,
  ADD COLUMN "inbound_secure" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inbound_username" TEXT,
  ADD COLUMN "inbound_encrypted_password" TEXT,
  ADD COLUMN "inbound_folder" TEXT NOT NULL DEFAULT 'INBOX',
  ADD COLUMN "inbound_is_active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inbound_last_polled_at" TIMESTAMPTZ(6),
  ADD COLUMN "inbound_last_poll_error" TEXT,
  ADD COLUMN "inbound_last_tested_at" TIMESTAMPTZ(6),
  ADD COLUMN "inbound_last_test_error" TEXT;
