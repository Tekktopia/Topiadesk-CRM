-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN "deal_health_score" INTEGER,
ADD COLUMN "deal_health_score_computed_at" TIMESTAMPTZ(6);
