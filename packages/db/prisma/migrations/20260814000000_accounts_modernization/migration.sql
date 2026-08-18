-- Accounts submodule modernization: soft-delete, tagging, dedicated
-- ownership-transfer audit action.

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE 'OWNERSHIP_TRANSFERRED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- GIN index for the tag-filter query (Prisma's `hasSome`/`has` on a text[]
-- column compiles to `&&`/`@>`, both GIN-indexable).
CREATE INDEX IF NOT EXISTS "accounts_tags_idx" ON "accounts" USING GIN ("tags");
