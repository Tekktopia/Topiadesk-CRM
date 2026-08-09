-- AlterTable
ALTER TABLE "users" ADD COLUMN "position_title" TEXT;
ALTER TABLE "users" ADD COLUMN "manager_id" UUID;

-- AlterTable
ALTER TABLE "case_categories" ADD COLUMN "default_workflow_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_categories" ADD CONSTRAINT "case_categories_default_workflow_id_fkey" FOREIGN KEY ("default_workflow_id") REFERENCES "automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
