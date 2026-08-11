-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('INSURED', 'BENEFICIARY', 'NOMINEE', 'DRIVER', 'ADDITIONAL_INSURED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('VEHICLE', 'PROPERTY', 'CARGO', 'VESSEL');

-- CreateTable
CREATE TABLE "policy_coverages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "coverage_name" TEXT NOT NULL,
    "coverage_type" TEXT NOT NULL,
    "sum_insured" DECIMAL(18,2),
    "premium" DECIMAL(15,2),
    "deductible" DECIMAL(15,2),
    "limits" TEXT,
    "sub_limits" TEXT,
    "conditions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "participant_type" "ParticipantType" NOT NULL,
    "name" TEXT NOT NULL,
    "contact_id" UUID,
    "relationship" TEXT,
    "percentage" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "asset_type" "AssetType" NOT NULL,
    "asset_name" TEXT NOT NULL,
    "registration_no" TEXT,
    "chassis_no" TEXT,
    "address" TEXT,
    "valuation" DECIMAL(18,2),
    "year" INTEGER,
    "make_model" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policy_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_coverages_policy_id_idx" ON "policy_coverages"("policy_id");

-- CreateIndex
CREATE INDEX "policy_participants_policy_id_idx" ON "policy_participants"("policy_id");

-- CreateIndex
CREATE INDEX "policy_participants_contact_id_idx" ON "policy_participants"("contact_id");

-- CreateIndex
CREATE INDEX "policy_assets_policy_id_idx" ON "policy_assets"("policy_id");

-- AddForeignKey
ALTER TABLE "policy_coverages" ADD CONSTRAINT "policy_coverages_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_participants" ADD CONSTRAINT "policy_participants_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_participants" ADD CONSTRAINT "policy_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_assets" ADD CONSTRAINT "policy_assets_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
