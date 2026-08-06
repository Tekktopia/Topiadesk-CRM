-- CreateEnum
CREATE TYPE "CarrierPanelStatus" AS ENUM ('PROSPECTIVE', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- AlterEnum
ALTER TYPE "DocumentEntityType" ADD VALUE 'CARRIER';

-- AlterTable
-- USING cast (not DROP+ADD, which the raw `prisma migrate diff` output
-- proposed) — preserves existing data. Every carrier's panel_status seeded
-- so far only ever used "ACTIVE", a valid label on the new enum, so this
-- cast never fails; a value that didn't match one of the four labels would
-- need a manual backfill first, which isn't needed here.
ALTER TABLE "carriers" ALTER COLUMN "panel_status" TYPE "CarrierPanelStatus" USING ("panel_status"::"CarrierPanelStatus");
