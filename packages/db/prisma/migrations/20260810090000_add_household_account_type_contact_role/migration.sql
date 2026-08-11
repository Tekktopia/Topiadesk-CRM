-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'HOUSEHOLD';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "household_role" TEXT;
