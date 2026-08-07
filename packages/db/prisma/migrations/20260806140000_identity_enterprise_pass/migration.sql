-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "required_approvals_to_grant" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "pending_role_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_role_grants_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pending_role_grants" ADD CONSTRAINT "pending_role_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_role_grants" ADD CONSTRAINT "pending_role_grants_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_role_grants" ADD CONSTRAINT "pending_role_grants_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
