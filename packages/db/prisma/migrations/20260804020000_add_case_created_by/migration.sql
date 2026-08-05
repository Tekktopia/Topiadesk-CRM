-- AlterTable: Case — track the requester/filer, distinct from assignedToId.
-- Nullable: system/omnichannel-originated cases have no human creator, and
-- existing rows have no historical record of who created them.
ALTER TABLE "cases" ADD COLUMN "created_by_id" UUID;
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cases_created_by_id_idx" ON "cases"("created_by_id");
