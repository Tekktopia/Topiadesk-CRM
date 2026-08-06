-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "chain_id" UUID;

-- CreateTable
CREATE TABLE "approval_chains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "ApprovalEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "required_approvals" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_threshold_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_type" "PolicyVersionType" NOT NULL,
    "min_amount" DECIMAL(18,2),
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_threshold_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_chains_entity_type_entity_id_idx" ON "approval_chains"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "approval_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
