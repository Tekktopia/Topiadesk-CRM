import { randomUUID } from 'node:crypto';
import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getPrismaClient } from '@topiadesk/db';
import { getMinioClient } from '../documents/minio-client';

interface DocuSignConnectorConfig {
  docusign?: { accountId?: string; basePath?: string; accessToken?: string };
}

interface DocuSignEnvelopeResponse {
  envelopeId?: string;
  status?: string;
  errorCode?: string;
  message?: string;
}

async function streamToBase64(stream: unknown): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
  }
  return Buffer.concat(chunks).toString('base64');
}

/**
 * E-signature for policy documents via DocuSign (chosen as the category-
 * defining vendor, same "one real name" reasoning as Paystack/Dojah — see
 * ConnectorType.DOCUSIGN's schema comment). Real API call now — POSTs to
 * DocuSign's real `POST /v2.1/accounts/{accountId}/envelopes` using
 * IntegrationConnector.config.docusign.{accountId, basePath, accessToken},
 * fetching the actual document bytes from MinIO (same GetObjectCommand
 * pattern documents.service.ts's own download path uses) and
 * base64-encoding them into the envelope body exactly as DocuSign's API
 * requires.
 *
 * `accessToken` is assumed already valid in config, not obtained here —
 * DocuSign's own token-acquisition path (JWT Grant: an RSA keypair,
 * one-time admin consent, then server-to-server refresh) is real,
 * separate OAuth infrastructure of its own, out of scope for this pass
 * (flagged, not built) the same way full DNS-01 wildcard-cert automation
 * was for Traefik — a real deployment wires that up once, independent of
 * this envelope-creation call itself being genuine. Falls back to the
 * pre-existing stub behavior (fabricated envelopeId, no HTTP call) when no
 * connector is configured yet, or it has no accessToken — so this doesn't
 * hard-break the signature-request flow for every tenant just because
 * they haven't wired DocuSign up yet.
 *
 * Unlike Paystack/Dojah/WhatsApp, this one DOES get a real, purpose-built
 * table (SignatureRequest) rather than reusing IntegrationLog alone — the
 * per-signer SENT/VIEWED/SIGNED/DECLINED/EXPIRED lifecycle with a real name/
 * email genuinely needs structured, queryable state for the UI (a "pending
 * signatures" list), not just log-line correlation. The IntegrationLog
 * correlation is still written alongside it, matching the sibling
 * integrations' audit-trail convention.
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
    const documentVersion = await prisma.documentVersion.findUnique({
      where: { id: params.documentVersionId },
      include: { document: true },
    });
    if (!documentVersion) throw new NotFoundException('Document version not found');
    const policy = await prisma.policy.findUnique({ where: { id: params.policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'DOCUSIGN', isEnabled: true } });
    const creds = (connector?.config as DocuSignConnectorConfig | null)?.docusign;

    let externalEnvelopeId = `stub_${randomUUID()}`;
    let liveCall = false;

    if (creds?.accessToken && creds.accountId) {
      liveCall = true;
      const basePath = creds.basePath ?? 'https://demo.docusign.net/restapi';
      const object = await getMinioClient().send(
        new GetObjectCommand({ Bucket: documentVersion.storageBucket, Key: documentVersion.storageKey }),
      );
      if (!object.Body) throw new BadGatewayException('Document bytes missing from storage — cannot build DocuSign envelope');
      const documentBase64 = await streamToBase64(object.Body);
      const fileExtension = documentVersion.document.fileName.split('.').pop() ?? 'pdf';

      const res = await fetch(`${basePath}/v2.1/accounts/${creds.accountId}/envelopes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailSubject: `Please sign: ${documentVersion.document.fileName}`,
          documents: [{ documentBase64, name: documentVersion.document.fileName, fileExtension, documentId: '1' }],
          recipients: { signers: [{ email: params.signerEmail, name: params.signerName, recipientId: '1', routingOrder: '1' }] },
          status: 'sent',
        }),
      });
      const json = (await res.json().catch(() => null)) as DocuSignEnvelopeResponse | null;
      if (!res.ok || !json?.envelopeId) {
        throw new BadGatewayException(`DocuSign envelope creation failed: ${json?.message ?? res.statusText}`);
      }
      externalEnvelopeId = json.envelopeId;
    } else {
      this.logger.warn(`send: no DOCUSIGN accessToken/accountId configured — falling back to stub envelope for policy ${params.policyId}`);
    }

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
          message: `${liveCall ? '' : '[stub] '}Sent DocuSign envelope ${externalEnvelopeId} to ${params.signerEmail} for policy ${params.policyId}`,
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
   * ({event, data: {envelopeId, envelopeSummary: {status}}}). Still gated
   * only by WebhookReceiverController's generic per-connector shared
   * secret, not DocuSign Connect's own HMAC header — see that class's
   * header comment; Paystack's real signature verification was
   * prioritized this pass since it gates money movement, DocuSign's own
   * real HMAC check is a flagged follow-up.
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
