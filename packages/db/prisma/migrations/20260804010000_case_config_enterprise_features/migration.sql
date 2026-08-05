-- AlterTable: SlaPolicy — admin-orderable tiebreak rank
ALTER TABLE "sla_policies" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: CaseCategory — hierarchy
ALTER TABLE "case_categories" ADD COLUMN "parent_id" UUID;
ALTER TABLE "case_categories" ADD CONSTRAINT "case_categories_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "case_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "case_categories_parent_id_idx" ON "case_categories"("parent_id");

-- AlterTable: LossCauseCategory — hierarchy
ALTER TABLE "loss_cause_categories" ADD COLUMN "parent_id" UUID;
ALTER TABLE "loss_cause_categories" ADD CONSTRAINT "loss_cause_categories_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "loss_cause_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "loss_cause_categories_parent_id_idx" ON "loss_cause_categories"("parent_id");

-- AlterTable: Macro — simple flat categorization/grouping
ALTER TABLE "macros" ADD COLUMN "category" TEXT;
