-- CreateEnum
CREATE TYPE "ActivityEmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED_NO_EMAIL');

-- AlterTable: tracks whether an OUTBOUND case comment's customer-facing
-- email actually went out — null for comments that were never eligible
-- (INTERNAL notes, non-Case activities, inbound messages).
ALTER TABLE "activities" ADD COLUMN "email_delivery_status" "ActivityEmailDeliveryStatus";
