-- Convert leads.source from the fixed "LeadSource" enum to a plain TEXT
-- column referencing a new admin-managed lead_sources lookup table by its
-- stable `code` (not `id`) — existing enum label values become the seeded
-- codes 1:1, so every existing row's value is preserved unchanged.

-- AlterTable: enum -> text, preserving existing values verbatim.
ALTER TABLE "leads" ALTER COLUMN "source" TYPE TEXT USING ("source"::TEXT);

-- DropEnum: safe now that no column references it.
DROP TYPE "LeadSource";

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_code_key" ON "lead_sources"("code");

-- Seed rows matching the original enum's 8 labels exactly (id/code/name),
-- so the FK backfill below (and every existing Lead row) resolves cleanly.
INSERT INTO "lead_sources" ("id", "name", "code", "is_active", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'Web', 'WEB', true, 0, now()),
  (gen_random_uuid(), 'Email', 'EMAIL', true, 1, now()),
  (gen_random_uuid(), 'Referral', 'REFERRAL', true, 2, now()),
  (gen_random_uuid(), 'Partner', 'PARTNER', true, 3, now()),
  (gen_random_uuid(), 'Social', 'SOCIAL', true, 4, now()),
  (gen_random_uuid(), 'Phone', 'PHONE', true, 5, now()),
  (gen_random_uuid(), 'Event', 'EVENT', true, 6, now()),
  (gen_random_uuid(), 'Other', 'OTHER', true, 7, now());

-- AddForeignKey: leads.source -> lead_sources.code (natural key, not the
-- surrogate id) — see Lead.source's own schema.prisma comment for why.
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_fkey" FOREIGN KEY ("source") REFERENCES "lead_sources"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
