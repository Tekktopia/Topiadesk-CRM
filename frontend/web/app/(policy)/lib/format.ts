/**
 * Formatting + status-color helpers shared across app/(policy)/ views.
 * Pure functions only (no hooks/browser APIs) — safe to import from both
 * Server and Client Components.
 */
import type { BadgeProps } from '@topiadesk/ui';

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

/** Decimal amounts cross the API as strings (see decimal.util.ts on the
 * backend — Prisma Decimal -> string, never a JS number, to avoid float
 * precision loss on money). Parse only at the presentation edge. */
export function formatNaira(amount: string | number | null | undefined, currency = 'NGN'): string {
  if (amount === null || amount === undefined) return '—';
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '—';
  if (currency !== 'NGN') {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  }
  return nairaFormatter.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Whole-day distance from today, negative when in the past (overdue). */
export function daysUntil(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  const msPerDay = 1000 * 60 * 60 * 24;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

type Variant = NonNullable<BadgeProps['variant']>;

const POLICY_STATUS_VARIANT: Record<string, Variant> = {
  QUOTED: 'outline',
  BOUND: 'secondary',
  ISSUED: 'success',
  ENDORSED: 'default',
  RENEWED: 'success',
  LAPSED: 'warning',
  CANCELLED: 'destructive',
};

export function policyStatusVariant(status: string): Variant {
  return POLICY_STATUS_VARIANT[status] ?? 'outline';
}

const APPROVAL_STATUS_VARIANT: Record<string, Variant> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
};

export function approvalStatusVariant(status: string | null | undefined): Variant {
  if (!status) return 'outline';
  return APPROVAL_STATUS_VARIANT[status] ?? 'outline';
}

const PREMIUM_STATUS_VARIANT: Record<string, Variant> = {
  PENDING: 'outline',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'destructive',
};

export function premiumStatusVariant(status: string): Variant {
  return PREMIUM_STATUS_VARIANT[status] ?? 'outline';
}

const RENEWAL_STATUS_VARIANT: Record<string, Variant> = {
  ON_TRACK: 'success',
  AT_RISK: 'warning',
  IN_PROGRESS: 'default',
  RENEWED: 'success',
  LAPSED: 'destructive',
  DECLINED_TO_RENEW: 'destructive',
};

export function renewalStatusVariant(status: string): Variant {
  return RENEWAL_STATUS_VARIANT[status] ?? 'outline';
}

const AGING_BUCKET_LABEL: Record<string, string> = {
  CURRENT: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_PLUS': '90+ days',
};

export function agingBucketLabel(bucket: string): string {
  return AGING_BUCKET_LABEL[bucket] ?? bucket;
}

export const AGING_BUCKET_ORDER = ['CURRENT', '1_30', '31_60', '61_90', '90_PLUS'] as const;

const PRODUCER_STATUS_VARIANT: Record<string, Variant> = {
  ACTIVE: 'success',
  SUSPENDED: 'destructive',
};

export function producerStatusVariant(status: string): Variant {
  return PRODUCER_STATUS_VARIANT[status] ?? 'outline';
}

const PRODUCER_TYPE_LABEL: Record<string, string> = {
  INTERNAL_BROKER: 'Internal broker',
  EXTERNAL_SUB_BROKER: 'External sub-broker',
  CORRESPONDENT: 'Correspondent',
};

export function producerTypeLabel(type: string): string {
  return PRODUCER_TYPE_LABEL[type] ?? type;
}

const PRODUCER_COMMISSION_STATUS_VARIANT: Record<string, Variant> = {
  PENDING: 'outline',
  APPROVED: 'warning',
  PAID: 'success',
};

export function producerCommissionStatusVariant(status: string): Variant {
  return PRODUCER_COMMISSION_STATUS_VARIANT[status] ?? 'outline';
}

const PARTICIPANT_TYPE_LABEL: Record<string, string> = {
  INSURED: 'Insured',
  BENEFICIARY: 'Beneficiary',
  NOMINEE: 'Nominee',
  DRIVER: 'Driver',
  ADDITIONAL_INSURED: 'Additional insured',
};

export function participantTypeLabel(type: string): string {
  return PARTICIPANT_TYPE_LABEL[type] ?? type;
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  VEHICLE: 'Vehicle',
  PROPERTY: 'Property',
  CARGO: 'Cargo',
  VESSEL: 'Vessel',
};

export function assetTypeLabel(type: string): string {
  return ASSET_TYPE_LABEL[type] ?? type;
}
