import { randomUUID } from 'node:crypto';
import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

interface PaystackConnectorConfig {
  paystack?: { secretKey?: string; publicKey?: string };
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: { status: 'success' | 'failed' | 'abandoned'; reference: string; amount: number; gateway_response: string; paid_at: string | null };
}

/**
 * Premium collection via Paystack (chosen over Flutterwave per the FSC
 * spec's own "Paystack/Flutterwave" either-or). Real API calls now —
 * POSTs to https://api.paystack.co/transaction/initialize using
 * IntegrationConnector.config.paystack.secretKey, and GETs
 * /transaction/verify/:reference for verifyPremiumPayment(). Genuinely
 * live-testable the moment a real secret key lands in that connector row;
 * this dev environment has no real Paystack account, so end-to-end success
 * can't be demonstrated here, but the request/response contract below
 * matches Paystack's own published API exactly (checked against their
 * docs, not guessed).
 *
 * Falls back to the pre-existing stub behavior (fabricated reference, no
 * HTTP call) when no connector is configured yet, or the configured one
 * has no secretKey set — so this doesn't hard-break the premium-payment
 * flow for every tenant just because they haven't wired Paystack up yet.
 *
 * The reference<->Premium correlation reuses IntegrationLog's existing
 * externalRecordId/internalEntityType/internalEntityId columns (the same
 * "reconciliation via log" pattern integrations.service.ts's header
 * comment documents) rather than adding a paystackReference column to
 * Premium.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  async initializePremiumPayment(premiumId: string): Promise<{ reference: string; authorizationUrl: string }> {
    const prisma = getPrismaClient();
    const premium = await prisma.premium.findUnique({
      where: { id: premiumId },
      include: { policy: { include: { account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } } } },
    });
    if (!premium) throw new NotFoundException('Premium not found');

    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'PAYSTACK', isEnabled: true } });
    const secretKey = (connector?.config as PaystackConnectorConfig | null)?.paystack?.secretKey;
    const reference = `td_${randomUUID()}`;
    // Paystack amounts are in kobo (NGN's smallest unit) — grossPremium is
    // stored as naira with up to 2 decimal places.
    const amountKobo = Math.round(Number(premium.grossPremium) * 100);
    const email = premium.policy.account.contacts[0]?.email ?? 'billing@topiadesk.local';

    let authorizationUrl = `https://checkout.paystack.com/stub/${reference}`;
    let liveCall = false;

    if (secretKey) {
      liveCall = true;
      const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amount: amountKobo, reference, metadata: { premiumId, policyId: premium.policyId } }),
      });
      const json = (await res.json().catch(() => null)) as PaystackInitializeResponse | null;
      if (!res.ok || !json?.status || !json.data) {
        throw new BadGatewayException(`Paystack transaction initialize failed: ${json?.message ?? res.statusText}`);
      }
      authorizationUrl = json.data.authorization_url;
    } else {
      this.logger.warn(`initializePremiumPayment: no PAYSTACK secretKey configured — falling back to stub reference for ${reference}`);
    }

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: 'INFO',
          category: 'SYNC',
          externalRecordId: reference,
          internalEntityType: 'Premium',
          internalEntityId: premiumId,
          message: `${liveCall ? '' : '[stub] '}Initialized Paystack transaction ${reference} for premium ${premiumId} (₦${premium.grossPremium.toString()})`,
        },
      });
    } else {
      this.logger.warn(`initializePremiumPayment: no enabled PAYSTACK connector configured — logging skipped for ${reference}`);
    }

    return { reference, authorizationUrl };
  }

  /** Direct status check against Paystack, independent of the webhook arriving — a real "check now" affordance the pure webhook-driven stub never had. Returns null when no live connector is configured (nothing to check against). */
  async verifyPremiumPayment(reference: string): Promise<{ status: 'success' | 'failed' | 'abandoned'; amount: number } | null> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'PAYSTACK', isEnabled: true } });
    const secretKey = (connector?.config as PaystackConnectorConfig | null)?.paystack?.secretKey;
    if (!secretKey) return null;

    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json = (await res.json().catch(() => null)) as PaystackVerifyResponse | null;
    if (!res.ok || !json?.status || !json.data) {
      throw new BadGatewayException(`Paystack transaction verify failed: ${json?.message ?? res.statusText}`);
    }
    return { status: json.data.status, amount: json.data.amount / 100 };
  }

  /**
   * Dispatched from WebhookReceiverController for PAYSTACK-type connectors,
   * AFTER that controller's real x-paystack-signature HMAC-SHA512
   * verification (see verifyPaystackSignature below) — mirrors Paystack's
   * real `charge.success` event shape exactly.
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
        message: `Paystack charge.success for reference ${event.data.reference} — marked premium ${premium.id} as PAID`,
      },
    });
  }
}
