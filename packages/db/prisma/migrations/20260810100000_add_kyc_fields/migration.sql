-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "kyc_expiry_date" DATE,
ADD COLUMN     "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "naicom_id" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "id_number" TEXT,
ADD COLUMN     "id_type" TEXT;
