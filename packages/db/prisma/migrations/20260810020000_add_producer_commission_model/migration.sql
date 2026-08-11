-- CreateEnum
CREATE TYPE "ProducerType" AS ENUM ('INTERNAL_BROKER', 'EXTERNAL_SUB_BROKER', 'CORRESPONDENT');

-- CreateEnum
CREATE TYPE "ProducerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProducerAssignmentRole" AS ENUM ('PRIMARY', 'SUB_PRODUCER', 'SERVICING');

-- CreateEnum
CREATE TYPE "ProducerCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "producers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProducerType" NOT NULL DEFAULT 'INTERNAL_BROKER',
    "status" "ProducerStatus" NOT NULL DEFAULT 'ACTIVE',
    "license_number" TEXT,
    "license_expiry" DATE,
    "phone" TEXT,
    "email" TEXT,
    "parent_producer_id" UUID,
    "linked_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "producers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_policy_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "role" "ProducerAssignmentRole" NOT NULL DEFAULT 'PRIMARY',
    "commission_split_percent" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producer_policy_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_commissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commission_number" TEXT NOT NULL,
    "policy_id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "premium_id" UUID,
    "premium_base" DECIMAL(15,2) NOT NULL,
    "commission_percent" DECIMAL(5,2) NOT NULL,
    "commission_amount" DECIMAL(15,2) NOT NULL,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "wht_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(15,2) NOT NULL,
    "status" "ProducerCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "period" TEXT NOT NULL,
    "payment_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "producer_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producers_producer_code_key" ON "producers"("producer_code");

-- CreateIndex
CREATE UNIQUE INDEX "producers_linked_user_id_key" ON "producers"("linked_user_id");

-- CreateIndex
CREATE INDEX "producers_parent_producer_id_idx" ON "producers"("parent_producer_id");

-- CreateIndex
CREATE INDEX "producer_policy_assignments_producer_id_idx" ON "producer_policy_assignments"("producer_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_policy_assignments_policy_id_producer_id_key" ON "producer_policy_assignments"("policy_id", "producer_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_commissions_commission_number_key" ON "producer_commissions"("commission_number");

-- CreateIndex
CREATE INDEX "producer_commissions_producer_id_status_idx" ON "producer_commissions"("producer_id", "status");

-- CreateIndex
CREATE INDEX "producer_commissions_policy_id_idx" ON "producer_commissions"("policy_id");

-- AddForeignKey
ALTER TABLE "producers" ADD CONSTRAINT "producers_parent_producer_id_fkey" FOREIGN KEY ("parent_producer_id") REFERENCES "producers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producers" ADD CONSTRAINT "producers_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_policy_assignments" ADD CONSTRAINT "producer_policy_assignments_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_policy_assignments" ADD CONSTRAINT "producer_policy_assignments_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_commissions" ADD CONSTRAINT "producer_commissions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_commissions" ADD CONSTRAINT "producer_commissions_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_commissions" ADD CONSTRAINT "producer_commissions_premium_id_fkey" FOREIGN KEY ("premium_id") REFERENCES "premiums"("id") ON DELETE SET NULL ON UPDATE CASCADE;
