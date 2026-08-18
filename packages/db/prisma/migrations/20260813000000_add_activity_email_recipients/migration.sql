-- Actual recipients used for an OUTBOUND Case email (explicit choice from
-- SendCaseEmailDialog, or the legacy auto-resolved contact email written
-- back by the worker) — see Activity.emailTo/emailCc's schema comment.
ALTER TABLE "activities" ADD COLUMN "email_to" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "activities" ADD COLUMN "email_cc" TEXT[] NOT NULL DEFAULT '{}';
