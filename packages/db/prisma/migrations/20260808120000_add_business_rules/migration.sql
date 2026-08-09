-- CreateEnum
CREATE TYPE "BusinessRuleOperator" AS ENUM ('EQUALS', 'NOT_EQUALS');

-- CreateTable
CREATE TABLE "business_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "CaseManagementEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition_field" TEXT NOT NULL,
    "condition_operator" "BusinessRuleOperator" NOT NULL,
    "condition_value" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_rules_entity_type_is_active_idx" ON "business_rules"("entity_type", "is_active");
