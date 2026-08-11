-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "health_score" INTEGER,
ADD COLUMN "health_score_computed_at" TIMESTAMPTZ(6);
