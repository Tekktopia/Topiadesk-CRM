-- CreateEnum
CREATE TYPE "FieldPermissionVisibility" AS ENUM ('HIDDEN', 'READ_ONLY');

-- CreateTable
CREATE TABLE "field_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "visibility" "FieldPermissionVisibility" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_permissions_role_id_resource_field_name_key" ON "field_permissions"("role_id", "resource", "field_name");

-- AddForeignKey
ALTER TABLE "field_permissions" ADD CONSTRAINT "field_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
