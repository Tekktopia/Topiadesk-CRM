import type { AutomationConditionsShape, AutomationRuleDto } from './types';

/**
 * Turns a stored rule back into a sentence.
 *
 * The rules list used to render `JSON.stringify(conditions)` and
 * `JSON.stringify(actions)` into two truncated monospace columns. That is
 * unreadable at a glance, which matters more than it sounds: the list is
 * where an admin goes to answer "which rule is emailing our clients?", and a
 * wall of truncated JSON makes that question unanswerable without opening
 * every row.
 *
 * Deliberately kept as plain string-building on the client rather than a
 * field served by the API — it is presentation, and it must not fail or
 * block if a rule holds an older or unexpected shape.
 */

const OPERATOR_PHRASES: Record<string, string> = {
  EQUALS: 'is',
  NOT_EQUALS: 'is not',
  IN: 'is one of',
  NOT_IN: 'is none of',
  IS_EMPTY: 'is empty',
  IS_NOT_EMPTY: 'is set',
  GREATER_THAN: '>',
  LESS_THAN: '<',
  CONTAINS: 'contains',
  OLDER_THAN: 'older than',
  NEWER_THAN: 'within the last',
  WITHIN_NEXT: 'within the next',
  OVERDUE_BY: 'overdue by',
};

const ENTITY_LABELS: Record<string, string> = {
  CASE: 'Tickets',
  CLAIM: 'Claims',
  POLICY: 'Policies',
  OPPORTUNITY: 'Opportunities',
  LEAD: 'Leads',
  TASK: 'Tasks',
  ACCOUNT: 'Clients',
  CONTACT: 'Contacts',
};

const ACTION_LABELS: Record<string, string> = {
  SET_STATUS: 'set status',
  SET_PRIORITY: 'set priority',
  ASSIGN_TO_USER: 'assign to a person',
  ASSIGN_TO_TEAM: 'assign to a team',
  ADD_INTERNAL_NOTE: 'add a note',
  SEND_NOTIFICATION: 'notify a colleague',
  SEND_EMAIL: 'send an email',
  CREATE_TASK: 'create a task',
  UPDATE_FIELD: 'update a field',
  CALL_WEBHOOK: 'call a webhook',
  NOTIFY_TEAMS_CHANNEL: 'post to Teams',
};

function conditionsOf(rule: AutomationRuleDto): AutomationConditionsShape {
  const raw = rule.conditions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as AutomationConditionsShape;
}

export function describeRuleConditions(rule: AutomationRuleDto): string {
  const conditions = conditionsOf(rule);
  const entity = conditions.entityType ? (ENTITY_LABELS[conditions.entityType] ?? conditions.entityType) : 'Records';
  const parts = (conditions.rules ?? []).map((r) => {
    const phrase = OPERATOR_PHRASES[r.operator] ?? r.operator;
    if (r.operator === 'IS_EMPTY' || r.operator === 'IS_NOT_EMPTY') return `${r.field} ${phrase}`;
    if (['OLDER_THAN', 'NEWER_THAN', 'WITHIN_NEXT', 'OVERDUE_BY'].includes(r.operator)) {
      return `${r.field} ${phrase} ${String(r.value)} ${(r.unit ?? 'DAYS').toLowerCase()}`;
    }
    const value = Array.isArray(r.value) ? r.value.join(', ') : String(r.value ?? '');
    return `${r.field} ${phrase} ${value}`;
  });
  if (parts.length === 0) return `${entity} — all of them`;
  return `${entity} where ${parts.join(conditions.match === 'ANY' ? ' or ' : ' and ')}`;
}

export function describeRuleActions(rule: AutomationRuleDto): string {
  const actions = Array.isArray(rule.actions) ? (rule.actions as { actionType?: string }[]) : [];
  if (actions.length === 0) return 'Nothing — no actions configured';
  return actions.map((a) => ACTION_LABELS[a.actionType ?? ''] ?? a.actionType ?? 'unknown').join(', ');
}

export function describeRuleSchedule(rule: AutomationRuleDto): string {
  if (rule.triggerType !== 'SCHEDULE') return 'When a record changes';
  if (!rule.scheduleCron) {
    // The state the migration deliberately left pre-existing SCHEDULE rows
    // in: they were created against a build where SCHEDULE did nothing, so
    // they carry no cadence and were switched off rather than guessed at.
    return 'No schedule set';
  }
  const zone = rule.scheduleTimezone && rule.scheduleTimezone !== 'UTC' ? ` (${rule.scheduleTimezone})` : '';
  const label = CRON_LABELS[rule.scheduleCron] ?? rule.scheduleCron;
  const next = rule.nextRunAt ? ` · next ${new Date(rule.nextRunAt).toLocaleString()}` : '';
  return `${label}${zone}${next}`;
}

const CRON_LABELS: Record<string, string> = {
  '*/15 * * * *': 'Every 15 minutes',
  '0 * * * *': 'Every hour',
  '0 */4 * * *': 'Every 4 hours',
  '0 8 * * *': 'Every day at 8:00',
  '0 18 * * *': 'Every day at 18:00',
  '0 8 * * 1-5': 'Weekdays at 8:00',
  '0 8 * * 1': 'Mondays at 8:00',
  '0 8 1 * *': 'First of the month at 8:00',
};
