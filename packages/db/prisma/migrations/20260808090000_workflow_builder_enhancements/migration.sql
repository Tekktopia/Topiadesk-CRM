-- CreateEnum
CREATE TYPE "AutomationRuleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
-- Decider's own comment at decision time, distinct from `reason` (the
-- requester's static explanation set at gate-open time).
ALTER TABLE "approvals" ADD COLUMN     "decision_note" TEXT;

-- AlterTable
-- Defaults to PUBLISHED (not DRAFT) so every existing rule — including
-- ones created via the separate /admin/automations JSON dialog, which
-- never sends this field — keeps running unchanged.
ALTER TABLE "automation_rules" ADD COLUMN     "status" "AutomationRuleStatus" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
-- Set instead of approval_id when an APPROVAL_GATE step's
-- requiredApprovals > 1 (the multi-approver quorum path, mirroring
-- PolicyVersion's existing ApprovalChain usage).
ALTER TABLE "automation_run_states" ADD COLUMN     "approval_chain_id" UUID;

-- CreateIndex
CREATE INDEX "automation_run_states_approval_chain_id_idx" ON "automation_run_states"("approval_chain_id");

-- AddForeignKey
ALTER TABLE "automation_run_states" ADD CONSTRAINT "automation_run_states_approval_chain_id_fkey" FOREIGN KEY ("approval_chain_id") REFERENCES "approval_chains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
