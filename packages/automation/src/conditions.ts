/**
 * The condition language shared by both trigger types.
 *
 * `AutomationRule.conditions` was previously an untyped `Json` column read by
 * exactly one function, which understood three keys (`entityType`,
 * `eventTypes`, `filters`) and treated `filters` as flat equality against
 * seven allowlisted case/claim fields. Anything else an admin saved was
 * silently ignored — a rule with a typo'd field name matched everything
 * rather than failing, which is the worst possible behaviour for a thing that
 * mutates records in bulk.
 *
 * Two changes here. First, real operators: equality alone cannot say
 * "expiring within 30 days" or "untouched for 48 hours", which is most of
 * what time-based automation is for. Second — and this is the part that makes
 * scheduling possible at all — every condition compiles to BOTH forms:
 *
 *   - `evaluate()`  — against an already-loaded row, for ENTITY_EVENT, where
 *                     the entity arrived with the event.
 *   - `toPrismaWhere()` — a `where` clause, for SCHEDULE, where the job must
 *                     FIND the matching rows and cannot load every policy in
 *                     the book to filter in memory.
 *
 * Keeping one source for both is what stops a rule from previewing one set of
 * records and acting on another.
 *
 * Legacy `filters: {field: value}` conditions keep working untouched —
 * `normalizeConditions()` lifts them into the new rule list as EQUALS.
 */

import { getEntityMeta, getFieldMeta, isAutomationEntityType, type AutomationEntityType } from './entity-registry';

export const CONDITION_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
  'GREATER_THAN',
  'LESS_THAN',
  'CONTAINS',
  'OLDER_THAN',
  'NEWER_THAN',
  'WITHIN_NEXT',
  'OVERDUE_BY',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const TIME_UNITS = ['MINUTES', 'HOURS', 'DAYS'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

const UNIT_MS: Record<TimeUnit, number> = {
  MINUTES: 60_000,
  HOURS: 3_600_000,
  DAYS: 86_400_000,
};

/** Operators that read a date field relative to "now" rather than to a literal. */
const RELATIVE_DATE_OPERATORS = new Set<ConditionOperator>(['OLDER_THAN', 'NEWER_THAN', 'WITHIN_NEXT', 'OVERDUE_BY']);

/** Operators that take no `value` at all. */
const NULLARY_OPERATORS = new Set<ConditionOperator>(['IS_EMPTY', 'IS_NOT_EMPTY']);

export function isRelativeDateOperator(op: ConditionOperator): boolean {
  return RELATIVE_DATE_OPERATORS.has(op);
}

export function isNullaryOperator(op: ConditionOperator): boolean {
  return NULLARY_OPERATORS.has(op);
}

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  /** Absent for IS_EMPTY/IS_NOT_EMPTY. A number of `unit`s for the relative date operators. */
  value?: unknown;
  /** Relative date operators only. */
  unit?: TimeUnit;
}

export interface AutomationConditions {
  entityType?: AutomationEntityType;
  /** ENTITY_EVENT only — which events wake the rule. Empty/absent means any. */
  eventTypes?: string[];
  /** How the rules combine. Defaults to ALL. */
  match?: 'ALL' | 'ANY';
  rules?: ConditionRule[];
  /** SCHEDULE only — a safety valve so a mis-scoped rule can't touch the whole book in one run. */
  maxEntitiesPerRun?: number;
  /**
   * SCHEDULE only — whether a record may be acted on more than once.
   *
   * Defaults to once, ever. Most scheduled conditions stay true for as long
   * as the situation lasts ("expires within 30 days" is true for thirty
   * days), so a daily rule without suppression would re-fire on the same
   * record every day — thirty identical emails to one client. Repeating is
   * opt-in for that reason.
   */
  repeat?: 'ONCE_PER_RECORD' | 'EVERY_RUN' | { cooldownHours: number };
  /** @deprecated pre-existing flat equality shape; lifted into `rules` by normalizeConditions(). */
  filters?: Record<string, unknown>;
}

/**
 * Ceiling on how many records one scheduled run may act on.
 *
 * A rule that matches more than this is a mistake — nobody intends to email
 * two thousand clients from a maintenance job — so the run stops and reports
 * rather than proceeding, which is the recoverable failure of the two.
 */
export const DEFAULT_MAX_ENTITIES_PER_RUN = 200;
export const HARD_MAX_ENTITIES_PER_RUN = 1_000;

export function normalizeConditions(raw: unknown): AutomationConditions {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const c = raw as AutomationConditions;
  const rules: ConditionRule[] = Array.isArray(c.rules) ? [...c.rules] : [];

  // Pre-existing rows stored `filters: {status: 'OPEN'}`. Lift them so the
  // rest of this module only ever deals with one shape.
  if (c.filters && typeof c.filters === 'object' && !Array.isArray(c.filters)) {
    for (const [field, value] of Object.entries(c.filters)) {
      rules.push({ field, operator: 'EQUALS', value });
    }
  }

  return {
    entityType: isAutomationEntityType(c.entityType) ? c.entityType : undefined,
    eventTypes: Array.isArray(c.eventTypes) ? c.eventTypes.filter((e): e is string => typeof e === 'string') : undefined,
    match: c.match === 'ANY' ? 'ANY' : 'ALL',
    rules,
    maxEntitiesPerRun:
      typeof c.maxEntitiesPerRun === 'number' && Number.isFinite(c.maxEntitiesPerRun)
        ? Math.min(Math.max(1, Math.floor(c.maxEntitiesPerRun)), HARD_MAX_ENTITIES_PER_RUN)
        : DEFAULT_MAX_ENTITIES_PER_RUN,
    repeat: normalizeRepeat(c.repeat),
  };
}

function normalizeRepeat(raw: AutomationConditions['repeat']): AutomationConditions['repeat'] {
  if (raw === 'EVERY_RUN') return 'EVERY_RUN';
  if (raw && typeof raw === 'object' && typeof raw.cooldownHours === 'number' && Number.isFinite(raw.cooldownHours) && raw.cooldownHours > 0) {
    return { cooldownHours: raw.cooldownHours };
  }
  return 'ONCE_PER_RECORD';
}

export interface ConditionValidationIssue {
  index: number;
  field: string;
  message: string;
}

/**
 * Rejects a rule at SAVE time rather than letting it misbehave at RUN time.
 *
 * The old code skipped any condition naming a field outside its allowlist,
 * which turned a typo into "matches everything" — a rule meant for one
 * category silently applying to every ticket in the system. An unknown field
 * is now a validation error the admin sees while editing.
 */
export function validateConditions(conditions: AutomationConditions, requireEntityType: boolean): ConditionValidationIssue[] {
  const issues: ConditionValidationIssue[] = [];
  if (requireEntityType && !conditions.entityType) {
    issues.push({ index: -1, field: 'entityType', message: 'Choose which kind of record this rule applies to.' });
    return issues;
  }
  const meta = conditions.entityType ? getEntityMeta(conditions.entityType) : undefined;

  (conditions.rules ?? []).forEach((rule, index) => {
    if (!rule || typeof rule.field !== 'string' || rule.field.length === 0) {
      issues.push({ index, field: String(rule?.field ?? ''), message: 'Choose a field.' });
      return;
    }
    if (!CONDITION_OPERATORS.includes(rule.operator)) {
      issues.push({ index, field: rule.field, message: `"${String(rule.operator)}" is not a valid comparison.` });
      return;
    }
    const fieldMeta = meta ? getFieldMeta(meta.entityType, rule.field) : undefined;
    if (meta && !fieldMeta) {
      issues.push({ index, field: rule.field, message: `${meta.label} has no field called "${rule.field}".` });
      return;
    }
    if (isRelativeDateOperator(rule.operator)) {
      if (fieldMeta && fieldMeta.kind !== 'date') {
        issues.push({ index, field: rule.field, message: `"${fieldMeta.label}" is not a date, so it cannot be compared to a point in time.` });
      }
      if (typeof rule.value !== 'number' || !Number.isFinite(rule.value) || rule.value < 0) {
        issues.push({ index, field: rule.field, message: 'Enter how much time as a positive number.' });
      }
      if (rule.unit && !TIME_UNITS.includes(rule.unit)) {
        issues.push({ index, field: rule.field, message: `"${String(rule.unit)}" is not a valid unit of time.` });
      }
      return;
    }
    if (!isNullaryOperator(rule.operator) && rule.value === undefined) {
      issues.push({ index, field: rule.field, message: 'Enter a value to compare against.' });
      return;
    }
    if ((rule.operator === 'IN' || rule.operator === 'NOT_IN') && !Array.isArray(rule.value)) {
      issues.push({ index, field: rule.field, message: 'This comparison needs a list of values.' });
      return;
    }
    if (fieldMeta?.kind === 'enum' && fieldMeta.enumValues) {
      const candidates = rule.operator === 'IN' || rule.operator === 'NOT_IN' ? (rule.value as unknown[]) : [rule.value];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && !fieldMeta.enumValues.includes(candidate)) {
          issues.push({
            index,
            field: rule.field,
            message: `"${candidate}" is not a valid ${fieldMeta.label.toLowerCase()} — expected one of ${fieldMeta.enumValues.join(', ')}.`,
          });
        }
      }
    }
  });

  return issues;
}

function relativeBoundary(rule: ConditionRule, now: Date): Date {
  const amount = typeof rule.value === 'number' ? rule.value : 0;
  const ms = amount * UNIT_MS[rule.unit ?? 'DAYS'];
  return rule.operator === 'WITHIN_NEXT' ? new Date(now.getTime() + ms) : new Date(now.getTime() - ms);
}

/**
 * One condition as a Prisma `where` fragment.
 *
 * Returns null for a condition that cannot be expressed against the database
 * (currently none, but callers must handle it rather than silently dropping —
 * a dropped condition widens the match, which is the failure mode this whole
 * module exists to prevent).
 */
export function ruleToPrismaWhere(rule: ConditionRule, now: Date): Record<string, unknown> | null {
  const { field, operator } = rule;
  switch (operator) {
    case 'EQUALS':
      return { [field]: rule.value };
    case 'NOT_EQUALS':
      return { [field]: { not: rule.value } };
    case 'IN':
      return { [field]: { in: rule.value as unknown[] } };
    case 'NOT_IN':
      return { [field]: { notIn: rule.value as unknown[] } };
    case 'IS_EMPTY':
      return { [field]: null };
    case 'IS_NOT_EMPTY':
      return { [field]: { not: null } };
    case 'GREATER_THAN':
      return { [field]: { gt: rule.value } };
    case 'LESS_THAN':
      return { [field]: { lt: rule.value } };
    case 'CONTAINS':
      return { [field]: { contains: String(rule.value), mode: 'insensitive' } };
    // "Created more than 3 days ago" — the timestamp is BEFORE the boundary.
    case 'OLDER_THAN':
      return { [field]: { lt: relativeBoundary(rule, now) } };
    case 'NEWER_THAN':
      return { [field]: { gte: relativeBoundary(rule, now) } };
    // "Expiring within 30 days" — between now and the future boundary. Bounded
    // at the near end too, so already-expired rows don't match a rule about
    // what is *about to* happen.
    case 'WITHIN_NEXT':
      return { [field]: { gte: now, lte: relativeBoundary(rule, now) } };
    // "Overdue by more than 2 days" — a due date that far in the past.
    case 'OVERDUE_BY':
      return { [field]: { lt: relativeBoundary(rule, now) } };
    default:
      return null;
  }
}

export function conditionsToPrismaWhere(conditions: AutomationConditions, now: Date): Record<string, unknown> {
  const fragments = (conditions.rules ?? [])
    .map((rule) => ruleToPrismaWhere(rule, now))
    .filter((f): f is Record<string, unknown> => f !== null);
  if (fragments.length === 0) return {};
  return conditions.match === 'ANY' ? { OR: fragments } : { AND: fragments };
}

function toComparable(value: unknown): number | string | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    // Prisma Decimal — compare numerically, not as "[object Object]".
    return Number((value as { toNumber(): number }).toNumber());
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

export function evaluateRule(rule: ConditionRule, entity: Record<string, unknown>, now: Date): boolean {
  const actual = entity[rule.field];
  switch (rule.operator) {
    case 'EQUALS':
      return toComparable(actual) === toComparable(rule.value);
    case 'NOT_EQUALS':
      return toComparable(actual) !== toComparable(rule.value);
    case 'IN':
      return Array.isArray(rule.value) && rule.value.map(toComparable).includes(toComparable(actual));
    case 'NOT_IN':
      return Array.isArray(rule.value) && !rule.value.map(toComparable).includes(toComparable(actual));
    case 'IS_EMPTY':
      return actual === null || actual === undefined || actual === '';
    case 'IS_NOT_EMPTY':
      return actual !== null && actual !== undefined && actual !== '';
    case 'GREATER_THAN': {
      const a = toComparable(actual);
      const b = toComparable(rule.value);
      return a !== null && b !== null && a > b;
    }
    case 'LESS_THAN': {
      const a = toComparable(actual);
      const b = toComparable(rule.value);
      return a !== null && b !== null && a < b;
    }
    case 'CONTAINS':
      return typeof actual === 'string' && actual.toLowerCase().includes(String(rule.value).toLowerCase());
    case 'OLDER_THAN':
    case 'NEWER_THAN':
    case 'WITHIN_NEXT':
    case 'OVERDUE_BY': {
      if (!(actual instanceof Date) && typeof actual !== 'string') return false;
      const at = actual instanceof Date ? actual.getTime() : Date.parse(actual);
      if (Number.isNaN(at)) return false;
      const boundary = relativeBoundary(rule, now).getTime();
      if (rule.operator === 'NEWER_THAN') return at >= boundary;
      if (rule.operator === 'WITHIN_NEXT') return at >= now.getTime() && at <= boundary;
      return at < boundary; // OLDER_THAN, OVERDUE_BY
    }
    default:
      return false;
  }
}

export function evaluateConditions(conditions: AutomationConditions, entity: Record<string, unknown>, now: Date): boolean {
  const rules = conditions.rules ?? [];
  if (rules.length === 0) return true;
  return conditions.match === 'ANY'
    ? rules.some((rule) => evaluateRule(rule, entity, now))
    : rules.every((rule) => evaluateRule(rule, entity, now));
}

/** Human-readable summary of a rule's conditions, for list rows and run logs. */
export function describeConditions(conditions: AutomationConditions): string {
  const rules = conditions.rules ?? [];
  if (rules.length === 0) return 'every record';
  const joiner = conditions.match === 'ANY' ? ' or ' : ' and ';
  return rules.map(describeRule).join(joiner);
}

function describeRule(rule: ConditionRule): string {
  const label = rule.field;
  const unit = (rule.unit ?? 'DAYS').toLowerCase();
  switch (rule.operator) {
    case 'EQUALS':
      return `${label} is ${String(rule.value)}`;
    case 'NOT_EQUALS':
      return `${label} is not ${String(rule.value)}`;
    case 'IN':
      return `${label} is one of ${(rule.value as unknown[]).join(', ')}`;
    case 'NOT_IN':
      return `${label} is none of ${(rule.value as unknown[]).join(', ')}`;
    case 'IS_EMPTY':
      return `${label} is empty`;
    case 'IS_NOT_EMPTY':
      return `${label} is set`;
    case 'GREATER_THAN':
      return `${label} is more than ${String(rule.value)}`;
    case 'LESS_THAN':
      return `${label} is less than ${String(rule.value)}`;
    case 'CONTAINS':
      return `${label} contains "${String(rule.value)}"`;
    case 'OLDER_THAN':
      return `${label} was more than ${String(rule.value)} ${unit} ago`;
    case 'NEWER_THAN':
      return `${label} was within the last ${String(rule.value)} ${unit}`;
    case 'WITHIN_NEXT':
      return `${label} falls in the next ${String(rule.value)} ${unit}`;
    case 'OVERDUE_BY':
      return `${label} is overdue by more than ${String(rule.value)} ${unit}`;
    default:
      return label;
  }
}
