-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');

-- AlterTable
-- Expand-only: nullable-safe default, no backfill needed (every existing
-- row gets OFFLINE, the correct value for a user who wasn't present when
-- this column didn't exist).
ALTER TABLE "users" ADD COLUMN "presence_status" "PresenceStatus" NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "users" ADD COLUMN "presence_updated_at" TIMESTAMPTZ(6);
