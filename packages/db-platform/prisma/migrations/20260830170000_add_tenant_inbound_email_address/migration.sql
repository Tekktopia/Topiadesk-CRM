-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "inbound_email_address" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_inbound_email_address_key" ON "tenants"("inbound_email_address");
