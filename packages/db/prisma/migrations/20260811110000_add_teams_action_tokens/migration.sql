-- CreateTable
-- Public-schema-only by design — see TeamsActionToken's schema.prisma
-- comment (same reasoning as api_keys). Deliberately NOT applied to
-- tenant schemas — no companion tenant-retrofit step follows this
-- migration.
CREATE TABLE "teams_action_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "tenant_schema" TEXT NOT NULL,
    "run_state_id" UUID NOT NULL,
    "acting_user_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_action_tokens_token_hash_key" ON "teams_action_tokens"("token_hash");
