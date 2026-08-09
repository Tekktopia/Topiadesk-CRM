-- AlterTable
ALTER TABLE "sla_targets" ADD COLUMN "on_breach_actions" JSONB;
ALTER TABLE "sla_targets" ADD COLUMN "on_escalate_actions" JSONB;
