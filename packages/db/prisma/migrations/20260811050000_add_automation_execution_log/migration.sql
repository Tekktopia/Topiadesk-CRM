-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SUCCESS', 'PARTIAL_FAILURE', 'FAILED');

-- CreateTable
CREATE TABLE "automation_execution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID,
    "rule_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "trigger_source" TEXT NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL,
    "action_results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_execution_logs_rule_id_created_at_idx" ON "automation_execution_logs"("rule_id", "created_at");

-- CreateIndex
CREATE INDEX "automation_execution_logs_entity_type_entity_id_idx" ON "automation_execution_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "automation_execution_logs" ADD CONSTRAINT "automation_execution_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
