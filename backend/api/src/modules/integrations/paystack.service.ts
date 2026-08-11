import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

/**
 * Premium collection via Paystack (chosen over Flutterwave per the FSC
 * spec's own "Paystack/Flutterwave" either-or). A deliberate STUB — no
 * live Paystack credentials exist in this environment, so
 * initializePremiumPayment() never makes a real HTTP call; it fabricates a
 * reference/checkout URL in the same shape Paystack's own
 * /transaction/initialize response would have. A real implementation
 * would POST to https://api.paystack.co/transaction/initialize using
 * IntegrationConnector.config.paystack.secretKey.
 *
 * The reference<->Premium correlation reuses IntegrationLog's existing
 * externalRecordId/internalEntityType/internalEntityId columns (the same
 * "reconciliation via log" pattern integrations.service.ts's header
 * comment documents) rather than adding a paystackReference column to
 * Premium — no new schema needed for a stub that isn't live yet.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  async initializePremiumPayment(premiumId: string): Promise<{ reference: string; authorizationUrl: string }> {
    const prisma = getPrismaClient();
    const premium = await prisma.premium.findUnique({ where: { id: premiumId } });
    if (!premium) throw new NotFoundException('Premium not found');

    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'PAYSTACK', isEnabled: true } });
    const reference = `stub_${randomUUID()}`;
    const authorizationUrl = `https://checkout.paystack.com/stub/${reference}`;

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: 'INFO',
          category: 'SYNC',
          externalRecordId: reference,
          internalEntityType: 'Premium',
          internalEntityId: premiumId,
          message: `[stub] Initialized Paystack transaction ${reference} for premium ${premiumId} (₦${premium.grossPremium.toString()})`,
        },
      });
    } else {
      this.logger.warn(`initializePremiumPayment: no enabled PAYSTACK connector configured — logging skipped for ${reference}`);
    }

    return { reference, authorizationUrl };
  }

  /**
   * Dispatched from WebhookReceiverController for PAYSTACK-type connectors
   * — mirrors Paystack's real `charge.success` event shape
   * ({event, data: {reference, amount, ...}}) closely enough to be a
   * realistic stand-in, but is never signature-verified against a real
   * Paystack secret (see WebhookReceiverController's own shared-secret
   * check, which already gates who can reach this at all).
   */
  async handleWebhookPayload(connectorId: string, payload: unknown): Promise<void> {
    const event = payload as { event?: string; data?: { reference?: string } } | null;
    if (event?.event !== 'charge.success' || !event.data?.reference) return;

    const prisma = getPrismaClient();
    const initLog = await prisma.integrationLog.findFirst({
      where: { connectorId, externalRecordId: event.data.reference, internalEntityType: 'Premium' },
      orderBy: { createdAt: 'desc' },
    });
    if (!initLog?.internalEntityId) {
      this.logger.warn(`handleWebhookPayload: no matching initialize log for reference ${event.data.reference}`);
      return;
    }

    const premium = await prisma.premium.findUnique({ where: { id: initLog.internalEntityId } });
    if (!premium) return;

    await prisma.premium.update({
      where: { id: premium.id },
      data: { paidAmount: premium.grossPremium, paidDate: new Date(), status: 'PAID' },
    });

    await prisma.integrationLog.create({
      data: {
        connectorId,
        level: 'INFO',
        category: 'RECONCILIATION',
        externalRecordId: event.data.reference,
        internalEntityType: 'Premium',
        internalEntityId: premium.id,
        message: `[stub] Paystack charge.success for reference ${event.data.reference} — marked premium ${premium.id} as PAID`,
      },
    });
  }
}
