/**
 * Human-readable labels for the resource/action/scope permission grid
 * seeded in packages/db/prisma/seed.ts (12 resources x {read,write} x
 * {OWN,DEPARTMENT,BRANCH,ALL} = 96 fixed Permission rows). Purely a UI
 * presentation layer — the backend does not hardcode meaning for these
 * strings beyond storing/matching them (see PermissionsController's
 * comment: "the resource/action/scope grid is seed-managed").
 */

export const RESOURCE_LABELS: Record<string, string> = {
  account: 'Accounts',
  lead: 'Leads',
  opportunity: 'Opportunities',
  task: 'Tasks',
  activity: 'Activities',
  policy: 'Policies',
  renewal_schedule: 'Renewal schedules',
  document: 'Documents',
  approval: 'Approvals',
  ai_usage: 'AI copilot usage',
  audit_log: 'Audit log',
  integration: 'Integrations',
  identity: 'Identity & admin (users, roles, org settings)',
  // Permission resource name stays "case" internally (DB/RLS/backend
  // unchanged) — this label is purely the Admin RBAC grid's display text,
  // matching the "Ticket" rename everywhere else a user reads this word.
  case: 'Tickets',
};

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

export const SCOPE_LABELS: Record<string, string> = {
  OWN: 'Own records only',
  DEPARTMENT: 'All records in their department',
  BRANCH: 'All records in their branch',
  ALL: 'All records, org-wide',
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

export const ACTION_LABELS: Record<string, string> = {
  read: 'read',
  write: 'read/write',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** e.g. "can read/write Policies — own records only" — the sentence the
 * Roles page uses to spell out what a single grant actually means, since
 * this is the most compliance-sensitive surface in the Admin UI. */
export function grantSentence(resource: string, action: string, scope: string): string {
  return `Can ${actionLabel(action)} ${resourceLabel(resource).toLowerCase()} — ${scopeLabel(scope).toLowerCase()}`;
}
