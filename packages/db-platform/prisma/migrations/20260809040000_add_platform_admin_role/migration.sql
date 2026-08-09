-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPPORT', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "platform_admin_users" ADD COLUMN "role" "PlatformAdminRole" NOT NULL DEFAULT 'SUPPORT';

-- DataMigration: this migration introduces the role concept for the first
-- time -- every row that already exists was, until this moment, equally
-- privileged. Promote all of them so nobody's access is silently reduced;
-- the column DEFAULT above only governs admins created AFTER this point.
UPDATE "platform_admin_users" SET "role" = 'SUPER_ADMIN';
