import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

/**
 * E-signature for policy documents via DocuSign (chosen as the category-
 * defining vendor, same "one real name" reasoning as Paystack/Dojah — see
 * ConnectorType.DOCUSIGN's schema comment). A deliberate STUB — no live
 * DocuSign credentials exist in this environment, so send() never makes a
 * real HTTP call; it fabricates an envelopeId in the same shape DocuSign's
 * own `POST /accounts/{accountId}/envelopes` response would have
 * ({envelopeId, status, statusDateTime}). A real implementation would build
 * a multipart envelope (document bytes fetched via DocumentsService's own
 * getDownloadStream — see documents.service.ts) and POST it using
 * IntegrationConnector.config.docusign.{accountId, integrationKey}.
 *
 * Unlike Paystack/Dojah/WhatsApp, this one DOES get a real, purpose-built
 * table (SignatureRequest) rather than reusing IntegrationLog alone — the
 * per-signer SENT/VIEWED/SIGNED/DECLINED/EXPIRED lifecycle with a real name/
 * email genuinely needs structured, queryable state for the UI (a "pending
 * signatures" list), not just log-line correlation. The IntegrationLog
 * correlation is still written alongside it, matching the sibling stubs'
 * audit-trail convention.
 */
@Injectable()
export class ESignatureService {
  private readonly logger = new Logger(ESignatureService.name);

  async send(params: {
    documentVersionId: string;
    policyId: string;
    signerName: string;
    signerEmail: string;
    sentById: string;
  }): Promise<{ id: string; externalEnvelopeId: string }> {
    const prisma = getPrismaClient();
    const documentVersion = await prisma.documentVersion.findUnique({ where: { id: params.documentVersionId } });
    if (!documentVersion) throw new NotFoundException('Document version not found');
    const policy = await prisma.policy.findUnique({ where: { id: params.policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'DOCUSIGN', isEnabled: true } });
    const externalEnvelopeId = `stub_${randomUUID()}`;

    const signatureRequest = await prisma.signatureRequest.create({
      data: {
        documentId: documentVersion.documentId,
        documentVersionId: documentVersion.id,
        policyId: params.policyId,
        signerName: params.signerName,
        signerEmail: params.signerEmail,
        externalEnvelopeId,
        sentById: params.sentById,
        status: 'SENT',
      },
    });

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: 'INFO',
          category: 'SYNC',
          externalRecordId: externalEnvelopeId,
          internalEntityType: 'SignatureRequest',
          internalEntityId: signatureRequest.id,
          message: `[stub] Sent DocuSign envelope ${externalEnvelopeId} to ${params.signerEmail} for policy ${params.policyId}`,
        },
      });
    } else {
      this.logger.warn(`send: no enabled DOCUSIGN connector configured — logging skipped for ${externalEnvelopeId}`);
    }

    return { id: signatureRequest.id, externalEnvelopeId };
  }

  /**
   * Dispatched from WebhookReceiverController for DOCUSIGN-type connectors —
   * mirrors DocuSign Connect's real envelope-status-update event shape
   * ({event, data: {envelopeId, envelopeSummary: {status}}}) closely enough
   * to be a realistic stand-in, never signature-verified against a real
   * DocuSign HMAC key (same caveat as paystack.service.ts's own webhook
   * handler — the shared-secret header check that gates who reaches this
   * at all is WebhookReceiverController's job, not this method's).
   */
  async handleWebhookPayload(_connectorId: string, payload: unknown): Promise<void> {
    const event = payload as { event?: string; data?: { envelopeId?: string; envelopeSummary?: { status?: string } } } | null;
    const envelopeId = event?.data?.envelopeId;
    const status = event?.data?.envelopeSummary?.status;
    if (!envelopeId || !status) return;

    const prisma = getPrismaClient();
    const signatureRequest = await prisma.signatureRequest.findFirst({ where: { externalEnvelopeId: envelopeId } });
    if (!signatureRequest) {
      this.logger.warn(`handleWebhookPayload: no matching signature request for envelope ${envelopeId}`);
      return;
    }
    // Terminal states only move forward — an already-SIGNED/DECLINED
    // request never regresses on a stray/duplicate delivery.
    if (signatureRequest.status === 'SIGNED' || signatureRequest.status === 'DECLINED') return;

    const now = new Date();
    if (status === 'delivered') {
      await prisma.signatureRequest.update({ where: { id: signatureRequest.id }, data: { status: 'VIEWED', viewedAt: now } });
    } else if (status === 'completed') {
      await prisma.signatureRequest.update({ where: { id: signatureRequest.id }, data: { status: 'SIGNED', signedAt: now } });
    } else if (status === 'declined') {
      await prisma.signatureRequest.update({ where: { id: signatureRequest.id }, data: { status: 'DECLINED', declinedAt: now } });
    } else if (status === 'voided') {
      await prisma.signatureRequest.update({ where: { id: signatureRequest.id }, data: { status: 'EXPIRED' } });
    }
  }
}
