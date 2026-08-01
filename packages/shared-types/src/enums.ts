/**
 * Hand-mirrored from packages/db/prisma/schema.prisma. Deliberately NOT
 * importing from @prisma/client here — frontend/web should never need the
 * Prisma engine binary. Keep in sync manually; Batch 1/2 agents extending
 * the schema should update both places in the same change.
 */

export const ACCOUNT_STATUSES = ['PROSPECT', 'CLIENT', 'FORMER_CLIENT'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_TYPES = ['INDIVIDUAL', 'CORPORATE'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const POLICY_STATUSES = ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const RENEWAL_STATUSES = ['ON_TRACK', 'AT_RISK', 'IN_PROGRESS', 'RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'READ'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
