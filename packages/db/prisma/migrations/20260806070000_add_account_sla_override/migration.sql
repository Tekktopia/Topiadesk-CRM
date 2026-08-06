-- CreateTable
CREATE TABLE "account_sla_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "entity_type" "CaseManagementEntityType" NOT NULL,
    "sla_policy_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_sla_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_sla_overrides_account_id_entity_type_key" ON "account_sla_overrides"("account_id", "entity_type");

-- AddForeignKey
ALTER TABLE "account_sla_overrides" ADD CONSTRAINT "account_sla_overrides_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sla_overrides" ADD CONSTRAINT "account_sla_overrides_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
