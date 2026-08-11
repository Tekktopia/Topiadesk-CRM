-- CreateTable
CREATE TABLE "microsoft_sso_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "azure_tenant_id" TEXT NOT NULL,
    "azure_client_id" TEXT NOT NULL,
    "encrypted_client_secret" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "microsoft_sso_configs_pkey" PRIMARY KEY ("id")
);
