/**
 * The MOCK_STUB connector's "adapter". There is no real fixture server
 * behind `IntegrationConnector.config.fixtureEndpoint`
 * (http://mock-core-broking.internal/... — not a resolvable host) — this
 * function generates the "fetched" payload in-process instead of making an
 * HTTP call. That's the entire mock: a real adapter (Phase 2+) would swap
 * this one function for an actual `fetch(connector.config.fixtureEndpoint)`
 * and keep everything downstream (validation, upsert, SyncJob/
 * IntegrationLog bookkeeping) unchanged.
 *
 * The record set is fixed/deterministic (not randomized) — re-running a
 * sync against the same connector re-processes the same 6 records, so a
 * second run demonstrates idempotent upsert (update, not duplicate) rather
 * than generating fresh noise every call.
 *
 * Records 4 and 5 are deliberately invalid (policyNumber blank on #4;
 * expiryDate before inceptionDate on #5) so the validation/error-logging
 * path is actually exercised by every sync run, not just the happy path.
 */
export interface ExternalPolicyRecord {
  externalId: string;
  policyNumber: string;
  accountName: string;
  carrierName: string;
  lineOfBusiness: string;
  sumInsured: string;
  currency: string;
  inceptionDate: string;
  expiryDate: string;
  status: string;
}

export function fetchMockFixtureBatch(_fixtureEndpoint: string): ExternalPolicyRecord[] {
  return [
    {
      externalId: 'CBS-1001',
      policyNumber: 'TDK-EXT-1001',
      accountName: 'Zenith Marine Traders Ltd',
      carrierName: 'AIICO Insurance Plc',
      lineOfBusiness: 'Marine',
      sumInsured: '250000000.00',
      currency: 'NGN',
      inceptionDate: '2025-01-01',
      expiryDate: '2026-01-01',
      status: 'ISSUED',
    },
    {
      externalId: 'CBS-1002',
      policyNumber: 'TDK-EXT-1002',
      accountName: 'Zenith Marine Traders Ltd',
      carrierName: 'Continental Reinsurance Plc',
      lineOfBusiness: 'Property',
      sumInsured: '120000000.00',
      currency: 'NGN',
      inceptionDate: '2025-03-01',
      expiryDate: '2026-03-01',
      status: 'BOUND',
    },
    {
      externalId: 'CBS-1003',
      policyNumber: 'TDK-EXT-1003',
      accountName: 'Horizon Aviation Services',
      carrierName: 'AIICO Insurance Plc',
      lineOfBusiness: 'Aviation',
      sumInsured: '800000000.00',
      currency: 'NGN',
      inceptionDate: '2025-06-01',
      expiryDate: '2026-06-01',
      status: 'ISSUED',
    },
    // Deliberately invalid: policyNumber blank — exercises validation failure.
    {
      externalId: 'CBS-1004',
      policyNumber: '',
      accountName: 'Horizon Aviation Services',
      carrierName: 'AIICO Insurance Plc',
      lineOfBusiness: 'Aviation',
      sumInsured: '90000000.00',
      currency: 'NGN',
      inceptionDate: '2025-07-01',
      expiryDate: '2026-07-01',
      status: 'QUOTED',
    },
    // Deliberately invalid: expiryDate before inceptionDate.
    {
      externalId: 'CBS-1005',
      policyNumber: 'TDK-EXT-1005',
      accountName: 'Zenith Marine Traders Ltd',
      carrierName: 'AIICO Insurance Plc',
      lineOfBusiness: 'Casualty',
      sumInsured: '30000000.00',
      currency: 'NGN',
      inceptionDate: '2025-09-01',
      expiryDate: '2024-01-01',
      status: 'ISSUED',
    },
    {
      externalId: 'CBS-1006',
      policyNumber: 'TDK-EXT-1006',
      accountName: 'Horizon Aviation Services',
      carrierName: 'Continental Reinsurance Plc',
      lineOfBusiness: 'Casualty',
      sumInsured: '50000000.00',
      currency: 'NGN',
      inceptionDate: '2025-09-01',
      expiryDate: '2026-09-01',
      status: 'QUOTED',
    },
  ];
}

const VALID_STATUSES = new Set(['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED']);

export function validateExternalPolicyRecord(record: ExternalPolicyRecord): string[] {
  const errors: string[] = [];
  if (!record.policyNumber?.trim()) errors.push('policyNumber is required');
  if (!record.accountName?.trim()) errors.push('accountName is required');
  if (!record.carrierName?.trim()) errors.push('carrierName is required');
  if (!Number.isFinite(Number(record.sumInsured)) || Number(record.sumInsured) <= 0) {
    errors.push('sumInsured must be a positive number');
  }
  if (!VALID_STATUSES.has(record.status)) errors.push(`status "${record.status}" is not a recognized PolicyStatus`);
  const inception = new Date(record.inceptionDate);
  const expiry = new Date(record.expiryDate);
  if (Number.isNaN(inception.getTime())) errors.push('inceptionDate is not a valid date');
  if (Number.isNaN(expiry.getTime())) errors.push('expiryDate is not a valid date');
  if (!Number.isNaN(inception.getTime()) && !Number.isNaN(expiry.getTime()) && expiry.getTime() <= inception.getTime()) {
    errors.push('expiryDate must be after inceptionDate');
  }
  return errors;
}
