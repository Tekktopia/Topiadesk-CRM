import { ACCOUNT_STATUSES, ACCOUNT_TYPES, LEAD_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from '@topiadesk/shared-types';

/**
 * Enum option lists + label/badge mappings for the CRM module.
 *
 * `@topiadesk/shared-types`'s enums.ts already hand-mirrors a subset of
 * backend/api's Prisma enums (account/lead/task); the rest used by this
 * module (RiskRating, CarrierType, LeadSource, ActivityType,
 * ActivityDirection, MarketSubmissionStatus) aren't in that shared file, so
 * they're hand-mirrored here from packages/db/prisma/schema.prisma using
 * the same "keep in sync manually" convention documented in enums.ts.
 */

export { ACCOUNT_STATUSES, ACCOUNT_TYPES, LEAD_STATUSES, TASK_PRIORITIES, TASK_STATUSES };

export const RISK_RATINGS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskRating = (typeof RISK_RATINGS)[number];

export const CARRIER_TYPES = ['INSURER', 'REINSURER', 'BOTH'] as const;
export type CarrierType = (typeof CARRIER_TYPES)[number];

export const LEAD_SOURCES = ['WEB', 'EMAIL', 'REFERRAL', 'PARTNER', 'SOCIAL', 'PHONE', 'EVENT', 'OTHER'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const MARKET_SUBMISSION_STATUSES = ['SUBMITTED', 'DECLINED', 'QUOTED', 'BOUND'] as const;
export type MarketSubmissionStatus = (typeof MARKET_SUBMISSION_STATUSES)[number];

export const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'WHATSAPP', 'PORTAL_MESSAGE', 'SMS'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'INTERNAL'] as const;
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number];

// Phase 2 — mirrors packages/db/prisma/schema.prisma's CustomFieldEntityType/
// CustomFieldType, SavedViewEntityType/SavedViewVisibility, and
// QuotaScopeType/QuotaPeriodType enums (same "keep in sync manually"
// convention as the rest of this file).
export const CUSTOM_FIELD_ENTITY_TYPES = ['ACCOUNT', 'CONTACT', 'LEAD', 'OPPORTUNITY'] as const;
export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'DECIMAL',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
  'USER_REFERENCE',
  'URL',
] as const;
export const CUSTOM_FIELD_OPTION_TYPES = new Set(['SELECT', 'MULTI_SELECT']);

export const SAVED_VIEW_ENTITY_TYPES = ['ACCOUNT', 'CONTACT', 'LEAD', 'OPPORTUNITY', 'TASK'] as const;
export const SAVED_VIEW_VISIBILITIES = ['PRIVATE', 'TEAM', 'DEPARTMENT', 'ORG'] as const;

export const QUOTA_SCOPE_TYPES = ['USER', 'DEPARTMENT', 'BRANCH', 'ORG'] as const;
export const QUOTA_PERIOD_TYPES = ['MONTH', 'QUARTER', 'YEAR'] as const;

export function savedViewVisibilityLabel(visibility: string): string {
  if (visibility === 'PRIVATE') return 'Only me';
  return humanize(visibility);
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';

const humanize = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');

export function accountStatusLabel(status: string): string {
  return humanize(status);
}
export function accountStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'CLIENT':
      return 'success';
    case 'PROSPECT':
      return 'secondary';
    case 'FORMER_CLIENT':
      return 'outline';
    default:
      return 'outline';
  }
}

export function riskRatingLabel(rating: string | null): string {
  return rating ? humanize(rating) : 'Unrated';
}
export function riskRatingVariant(rating: string | null): BadgeVariant {
  switch (rating) {
    case 'LOW':
      return 'success';
    case 'MEDIUM':
      return 'secondary';
    case 'HIGH':
      return 'warning';
    case 'CRITICAL':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function relationshipTypeLabel(type: string): string {
  return humanize(type);
}
export function relationshipTypeVariant(type: string): BadgeVariant {
  switch (type) {
    case 'PARENT_SUBSIDIARY':
      return 'secondary';
    case 'COMPETITOR':
      return 'destructive';
    case 'JOINT_VENTURE':
      return 'success';
    case 'REFERRAL_SOURCE':
      return 'outline';
    default:
      return 'outline';
  }
}

export function leadStatusLabel(status: string): string {
  return humanize(status);
}
export function leadStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'NEW':
      return 'secondary';
    case 'CONTACTED':
      return 'outline';
    case 'QUALIFIED':
      return 'success';
    case 'DISQUALIFIED':
      return 'destructive';
    case 'CONVERTED':
      return 'default';
    default:
      return 'outline';
  }
}

export function taskStatusLabel(status: string): string {
  return humanize(status);
}
export function taskStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'OPEN':
      return 'secondary';
    case 'IN_PROGRESS':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'CANCELLED':
      return 'outline';
    default:
      return 'outline';
  }
}

export function taskPriorityLabel(priority: string): string {
  return humanize(priority);
}
export function taskPriorityVariant(priority: string): BadgeVariant {
  switch (priority) {
    case 'LOW':
      return 'outline';
    case 'MEDIUM':
      return 'secondary';
    case 'HIGH':
      return 'warning';
    case 'URGENT':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function marketSubmissionStatusLabel(status: string): string {
  return humanize(status);
}
export function marketSubmissionStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'SUBMITTED':
      return 'secondary';
    case 'QUOTED':
      return 'default';
    case 'BOUND':
      return 'success';
    case 'DECLINED':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function activityTypeLabel(type: string): string {
  return humanize(type);
}

export function carrierTypeLabel(type: string): string {
  return humanize(type);
}

export { humanize };
