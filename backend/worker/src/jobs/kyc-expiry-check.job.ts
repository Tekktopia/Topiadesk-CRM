/**
 * KYC expiry automation — runs periodically to transition any VERIFIED accounts
 * whose kycExpiryDate has passed into EXPIRED status, so the renewal-blocking
 * logic (policy-lifecycle.ts:assertKycValidForRenewal) kicks in automatically
 * without manual intervention.
 *
 * This complements the fact that KYC expiry is enforced client-side (via KYC
 * Expiry Flow renewals block) — this job makes it discoverable in the
 * compliance dashboard and prevents users from accidentally renewing anyway.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';

export const KYC_EXPIRY_CHECK_QUEUE_NAME = 'kyc-expiry-check';

export interface KycExpiryCheckResult {
  tenantsProcessed: number;
  accountsProcessed: number;
}

/**
 * Scan all tenants and expire KYC for accounts where kycExpiryDate has passed.
 * Returns a summary of work done across all tenants.
 */
export async function runKycExpiryCheck(now: Date = new Date()): Promise<KycExpiryCheckResult> {
  const tenants = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findMany({ where: { status: 'ACTIVE' }, select: { schemaName: true } }),
  );

  let totalAccountsExpired = 0;

  for (const tenant of tenants) {
    const accountsExpired = await expireKycForTenant(tenant.schemaName, now);
    totalAccountsExpired += accountsExpired;
  }

  return { tenantsProcessed: tenants.length, accountsProcessed: totalAccountsExpired };
}

/**
 * Expire KYC for a single tenant. Finds all accounts where:
 * - kycStatus = 'VERIFIED' (only VERIFIED status can expire)
 * - kycExpiryDate < now (expiry date has passed)
 *
 * Updates them to kycStatus = 'EXPIRED' and logs the change.
 */
async function expireKycForTenant(tenantSchema: string, now: Date): Promise<number> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, async () => {
    const prisma = getPrismaClient();

    const accountsToExpire = await prisma.account.findMany({
      where: {
        kycStatus: 'VERIFIED',
        kycExpiryDate: {
          lt: now, // expiry date is in the past
        },
      },
      select: { id: true, name: true },
    });

    if (accountsToExpire.length === 0) {
      return 0;
    }

    // Transition all to EXPIRED in a single update
    await prisma.account.updateMany({
      where: {
        kycStatus: 'VERIFIED',
        kycExpiryDate: { lt: now },
      },
      data: { kycStatus: 'EXPIRED' },
    });

    console.log(`[kyc-expiry-check] ${tenantSchema}: expired KYC for ${accountsToExpire.length} account(s)`);
    return accountsToExpire.length;
  });
}

export function createKycExpiryCheckQueue(connection: Redis): Queue {
  return new Queue(KYC_EXPIRY_CHECK_QUEUE_NAME, { connection });
}

export function createKycExpiryCheckWorker(connection: Redis): Worker {
  return new Worker(
    KYC_EXPIRY_CHECK_QUEUE_NAME,
    async () => {
      const result = await runKycExpiryCheck();
      console.log(`[kyc-expiry-check] processed ${result.tenantsProcessed} tenant(s), expired ${result.accountsProcessed} total account(s)`);
      return result;
    },
    { connection },
  );
}

export async function scheduleKycExpiryCheck(queue: Queue): Promise<void> {
  // Run once per day at 00:00 UTC (cheap query, safe to run frequently)
  await queue.upsertJobScheduler('kyc-expiry-check-daily', { pattern: '0 0 * * *' }, { name: 'check' });
}
