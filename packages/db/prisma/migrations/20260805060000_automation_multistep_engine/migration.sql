-- AlterEnum
ALTER TYPE "ApprovalEntityType" ADD VALUE 'CASE_AUTOMATION_GATE';

-- AlterTable: additive, nullable — AutomationRule.actions (the existing
-- flat action list) is untouched; a rule with a non-empty `steps` array
-- runs through the new multi-step engine instead, everything else runs
-- through the existing flat executeActions() path unchanged.
ALTER TABLE "automation_rules" ADD COLUMN "steps" JSONB;

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "automation_run_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID NOT NULL,
    "entity_type" "CaseManagementEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "current_step_index" INTEGER NOT NULL DEFAULT 0,
    "context" JSONB,
    "approval_id" UUID,
    "failure_reason" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "automation_run_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_run_states_rule_id_idx" ON "automation_run_states"("rule_id");

-- CreateIndex
CREATE INDEX "automation_run_states_entity_type_entity_id_idx" ON "automation_run_states"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "automation_run_states_approval_id_idx" ON "automation_run_states"("approval_id");

-- AddForeignKey
ALTER TABLE "automation_run_states" ADD CONSTRAINT "automation_run_states_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run_states" ADD CONSTRAINT "automation_run_states_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
