-- CreateEnum
CREATE TYPE "PlatformNotificationType" AS ENUM ('TENANT_PROVISIONED', 'TENANT_PROVISIONING_FAILED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'SUPPORT_TICKET_CREATED');

-- CreateTable
CREATE TABLE "platform_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "PlatformNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_notifications_created_at_idx" ON "platform_notifications"("created_at");
