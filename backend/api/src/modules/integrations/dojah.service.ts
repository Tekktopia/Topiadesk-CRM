import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrismaClient, type Account } from '@topiadesk/db';

/**
 * KYC verification via Dojah (chosen over Smile Identity per the FSC
 * spec's own "Dojah/Smile Identity" either-or). A deliberate STUB — no
 * live Dojah credentials exist in this environment, so verifyKyc() never
 * makes a real HTTP call; it always simulates a successful verification. A
 * real implementation would POST the account's linked Contact's idType/
 * idNumber to Dojah's KYC API using IntegrationConnector.config.dojah.
 * appId/apiKey, then map Dojah's response status onto KycStatus instead of
 * hardcoding VERIFIED.
 *
 * Writes directly to Account.kycStatus/kycExpiryDate (the fields Tranche
 * 4's KYC Expiry Flow gate reads — see policy-lifecycle.ts's
 * assertKycValidForRenewal) rather than requiring a separate admin step.
 */
@Injectable()
export class DojahService {
  private readonly logger = new Logger(DojahService.name);

  async verifyKyc(accountId: string): Promise<Pick<Account, 'kycStatus' | 'kycExpiryDate'>> {
    const prisma = getPrismaClient();
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');

    const connector = await prisma.integrationConnector.findFirst({ where: { connectorType: 'DOJAH', isEnabled: true } });

    const kycExpiryDate = new Date();
    kycExpiryDate.setFullYear(kycExpiryDate.getFullYear() + 1);

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: { kycStatus: 'VERIFIED', kycExpiryDate },
      select: { kycStatus: true, kycExpiryDate: true },
    });

    if (connector) {
      await prisma.integrationLog.create({
        data: {
          connectorId: connector.id,
          level: 'INFO',
          category: 'SYNC',
          internalEntityType: 'Account',
          internalEntityId: accountId,
          message: `[stub] Dojah KYC verification simulated as VERIFIED for account ${accountId}, expiring ${kycExpiryDate.toISOString().slice(0, 10)}`,
        },
      });
    } else {
      this.logger.warn(`verifyKyc: no enabled DOJAH connector configured — logging skipped for account ${accountId}`);
    }

    return updated;
  }
}
