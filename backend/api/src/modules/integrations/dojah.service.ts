import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrismaClient, type Account } from '@topiadesk/db';

const DOJAH_BASE_URL = 'https://api.dojah.io/api/v1/kyc';

interface DojahConnectorConfig {
  dojah?: { appId?: string; apiKey?: string };
}

interface DojahResponse {
  entity?: Record<string, unknown>;
  error?: string;
}

/**
 * Maps Contact.idType's free-text value (contact-form-dialog.tsx has no
 * fixed enum for it — a plain "e.g. National ID, Passport" text input) onto
 * the specific Dojah endpoint that ID type actually needs. Case-insensitive
 * substring match, not exact — real data will be inconsistent
 * ("National ID", "NIN", "national id card"...).
 */
function resolveDojahLookup(idType: string): 'nin' | 'bvn' | 'passport' | 'dl' | null {
  const t = idType.toLowerCase();
  if (t.includes('nin') || t.includes('national')) return 'nin';
  if (t.includes('bvn') || t.includes('bank verification')) return 'bvn';
  if (t.includes('passport')) return 'passport';
  if (t.includes('driver') || t.includes('licence') || t.includes('license')) return 'dl';
  return null;
}

/**
 * KYC verification via Dojah (chosen over Smile Identity per the FSC
 * spec's own "Dojah/Smile Identity" either-or). Real API calls now — GETs
 * the ID-type-specific Dojah KYC endpoint (nin/bvn/passport/dl, see
 * resolveDojahLookup above) using IntegrationConnector.config.dojah.
 * appId/apiKey, then maps the real response onto KycStatus: a 200 with a
 * populated `entity` -> VERIFIED, anything else -> REJECTED. Genuinely
 * live-testable the moment real Dojah credentials land in that connector
 * row; this dev environment has none, so end-to-end success can't be
 * demonstrated here, but the request contract (endpoint per ID type,
 * AppId/Authorization headers) matches Dojah's own published API.
 *
 * Falls back to the pre-existing stub behavior (always VERIFIED, no HTTP
 * call) when no connector is configured yet, or it has no appId/apiKey —
 * so this doesn't hard-break KYC for every tenant just because they
 * haven't wired Dojah up yet.
 */
@Injectable()
export class DojahService {
  private readonly logger = new Logger(DojahService.name);

  async verifyKyc(accountId: string): Promise<Pick<Account, 'kycStatus' | 'kycExpiryDate'>> {
    const prisma = getPrismaClient();
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    });
    if (!account) throw new NotFoundException('Account not found');

    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'DOJAH', isEnabled: true } });
    const creds = (connector?.config as DojahConnectorConfig | null)?.dojah;

    let kycStatus: Account['kycStatus'] = 'VERIFIED';
    let liveCall = false;
    let detail = 'simulated as VERIFIED';

    if (creds?.appId && creds?.apiKey) {
      liveCall = true;
      const contact = account.contacts[0];
      if (!contact?.idType || !contact.idNumber) {
        throw new BadRequestException('The account\'s primary contact has no idType/idNumber on file — nothing to verify against Dojah.');
      }
      const lookup = resolveDojahLookup(contact.idType);
      if (!lookup) {
        throw new BadRequestException(`Contact idType "${contact.idType}" doesn't map to a known Dojah lookup (NIN/BVN/Passport/Driver's License).`);
      }

      const qs = new URLSearchParams();
      if (lookup === 'nin') qs.set('nin', contact.idNumber);
      else if (lookup === 'bvn') qs.set('bvn', contact.idNumber);
      else if (lookup === 'dl') qs.set('dl_number', contact.idNumber);
      else {
        qs.set('passport_number', contact.idNumber);
        qs.set('surname', contact.lastName);
      }

      const res = await fetch(`${DOJAH_BASE_URL}/${lookup}?${qs.toString()}`, {
        headers: { AppId: creds.appId, Authorization: creds.apiKey },
      });
      const json = (await res.json().catch(() => null)) as DojahResponse | null;
      if (res.status >= 500) {
        throw new BadGatewayException(`Dojah ${lookup} lookup failed: ${json?.error ?? res.statusText}`);
      }
      const verified = res.ok && Boolean(json?.entity);
      kycStatus = verified ? 'VERIFIED' : 'REJECTED';
      detail = verified ? `verified via Dojah ${lookup} lookup` : `rejected by Dojah ${lookup} lookup (${json?.error ?? 'no matching entity'})`;
    } else {
      this.logger.warn(`verifyKyc: no DOJAH appId/apiKey configured — falling back to stub VERIFIED for account ${accountId}`);
    }

    const kycExpiryDate = new Date();
    kycExpiryDate.setFullYear(kycExpiryDate.getFullYear() + 1);

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: { kycStatus, kycExpiryDate: kycStatus === 'VERIFIED' ? kycExpiryDate : null },
      select: { kycStatus: true, kycExpiryDate: true },
    });

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: kycStatus === 'VERIFIED' ? 'INFO' : 'WARN',
          category: 'SYNC',
          internalEntityType: 'Account',
          internalEntityId: accountId,
          message: `${liveCall ? '' : '[stub] '}Dojah KYC ${detail} for account ${accountId}${updated.kycExpiryDate ? `, expiring ${updated.kycExpiryDate.toISOString().slice(0, 10)}` : ''}`,
        },
      });
    } else {
      this.logger.warn(`verifyKyc: no enabled DOJAH connector configured — logging skipped for account ${accountId}`);
    }

    return updated;
  }
}
