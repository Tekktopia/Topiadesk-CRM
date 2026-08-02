import { getPrismaClient, type PolicyStatus } from '@topiadesk/db';
import type { ExternalPolicyRecord } from './fixtures/mock-core-broking-fixture';

/**
 * Swappable "upsert record" functions — the seam a real adapter would plug
 * into. CRM/Policy modules (Batch 1 Agents B/C) are being built in
 * parallel and may not expose service methods yet, so these call the
 * shared Prisma models directly (schema.prisma is frozen/shared regardless
 * of which agent writes the controller around it) rather than blocking on
 * their work. When those modules gain real AccountsService/PolicyService
 * methods, swap the bodies below for calls into them — every call site in
 * integrations.service.ts stays the same.
 *
 * Account/Carrier have no natural external-system unique key in the
 * schema, so these resolve by exact name match (find-or-create) — accurate
 * enough for the mock's fixed fixture set; a real adapter syncing from an
 * actual Core Broking System would match on that system's real account/
 * carrier IDs instead.
 */

export async function upsertAccountRecord(name: string, ownerId: string): Promise<{ id: string }> {
  const prisma = getPrismaClient();
  const existing = await prisma.account.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.account.create({
    data: { name, accountType: 'CORPORATE', status: 'CLIENT', ownerId, source: 'Core Broking System (Mock) sync' },
  });
}

export async function upsertCarrierRecord(name: string): Promise<{ id: string }> {
  const prisma = getPrismaClient();
  // carriers has no RLS policy (org-wide reference data, see
  // prisma/rls/001_enable_rls.sql — it's not in the protected-table list).
  const existing = await prisma.carrier.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.carrier.create({ data: { name, carrierType: 'INSURER' } });
}

export async function upsertPolicyRecord(
  record: ExternalPolicyRecord,
  accountId: string,
  carrierId: string,
): Promise<{ id: string; created: boolean }> {
  const prisma = getPrismaClient();
  const existing = await prisma.policy.findUnique({ where: { policyNumber: record.policyNumber } });
  const data = {
    accountId,
    carrierId,
    lineOfBusiness: record.lineOfBusiness,
    sumInsured: record.sumInsured,
    currency: record.currency,
    inceptionDate: new Date(record.inceptionDate),
    expiryDate: new Date(record.expiryDate),
    // Validated against PolicyStatus's members in validateExternalPolicyRecord() before this is ever called.
    status: record.status as PolicyStatus,
    externalSourceSystem: 'CORE_BROKING_SYSTEM_MOCK',
    externalSourceId: record.externalId,
  };
  if (existing) {
    const updated = await prisma.policy.update({ where: { id: existing.id }, data });
    return { id: updated.id, created: false };
  }
  const created = await prisma.policy.create({ data: { policyNumber: record.policyNumber, ...data } });
  return { id: created.id, created: true };
}
