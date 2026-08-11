-- AlterEnum
ALTER TYPE "ConnectorType" ADD VALUE 'DOCUSIGN';

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'SENT',
    "external_envelope_id" TEXT NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "declined_at" TIMESTAMPTZ(6),
    "decline_reason" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signature_requests_document_id_idx" ON "signature_requests"("document_id");

-- CreateIndex
CREATE INDEX "signature_requests_policy_id_idx" ON "signature_requests"("policy_id");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
