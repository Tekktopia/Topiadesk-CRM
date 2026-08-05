import type { Prisma } from '@topiadesk/db';

export type SegmentFieldType = 'string' | 'number' | 'date' | 'enum';
export type SegmentFieldEntity = 'contact' | 'account' | 'policy' | 'renewalSchedule' | 'premium' | 'opportunity';
export type SegmentFilterOperatorValue = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'contains';

interface SegmentFieldSpec {
  entity: SegmentFieldEntity;
  column: string;
  type: SegmentFieldType;
  enumValues?: readonly string[];
  operators: readonly SegmentFilterOperatorValue[];
}

const STRING_OPS = ['eq', 'neq', 'contains', 'in', 'notIn'] as const;
const COMPARABLE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn'] as const;
const ENUM_OPS = ['eq', 'neq', 'in', 'notIn'] as const;

/**
 * Duplicated from backend/api/src/modules/campaigns/segment-filters.ts —
 * this copy is what re-evaluates DYNAMIC AudienceSegments at actual send
 * time (see dispatch.job.ts). api and worker are independently deployable
 * apps with no shared code package for this, same reasoning as
 * renewal-schedule-alert.util.ts / threshold.ts. Keep both copies in sync
 * by hand — see the api copy's header comment for the full design
 * rationale (fixed allowlist, ALL-vs-ANY correlation semantics, etc.).
 */
export const SEGMENT_FILTERABLE_FIELDS: Record<string, SegmentFieldSpec> = {
  'contact.firstName': { entity: 'contact', column: 'firstName', type: 'string', operators: STRING_OPS },
  'contact.lastName': { entity: 'contact', column: 'lastName', type: 'string', operators: STRING_OPS },
  'contact.email': { entity: 'contact', column: 'email', type: 'string', operators: STRING_OPS },
  'contact.phone': { entity: 'contact', column: 'phone', type: 'string', operators: STRING_OPS },
  'contact.title': { entity: 'contact', column: 'title', type: 'string', operators: STRING_OPS },

  'account.name': { entity: 'account', column: 'name', type: 'string', operators: STRING_OPS },
  'account.accountType': { entity: 'account', column: 'accountType', type: 'enum', enumValues: ['INDIVIDUAL', 'CORPORATE'], operators: ENUM_OPS },
  'account.status': { entity: 'account', column: 'status', type: 'enum', enumValues: ['PROSPECT', 'CLIENT', 'FORMER_CLIENT'], operators: ENUM_OPS },
  'account.riskRating': { entity: 'account', column: 'riskRating', type: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], operators: ENUM_OPS },
  'account.city': { entity: 'account', column: 'city', type: 'string', operators: STRING_OPS },
  'account.state': { entity: 'account', column: 'state', type: 'string', operators: STRING_OPS },
  'account.country': { entity: 'account', column: 'country', type: 'string', operators: STRING_OPS },
  'account.annualRevenueBand': { entity: 'account', column: 'annualRevenueBand', type: 'string', operators: STRING_OPS },

  'policy.lineOfBusiness': { entity: 'policy', column: 'lineOfBusiness', type: 'string', operators: STRING_OPS },
  'policy.status': {
    entity: 'policy',
    column: 'status',
    type: 'enum',
    enumValues: ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
    operators: ENUM_OPS,
  },
  'policy.currency': { entity: 'policy', column: 'currency', type: 'string', operators: STRING_OPS },
  'policy.inceptionDate': { entity: 'policy', column: 'inceptionDate', type: 'date', operators: COMPARABLE_OPS },
  'policy.expiryDate': { entity: 'policy', column: 'expiryDate', type: 'date', operators: COMPARABLE_OPS },
  'policy.sumInsured': { entity: 'policy', column: 'sumInsured', type: 'number', operators: COMPARABLE_OPS },

  'renewalSchedule.renewalDueDate': { entity: 'renewalSchedule', column: 'renewalDueDate', type: 'date', operators: COMPARABLE_OPS },
  'renewalSchedule.status': {
    entity: 'renewalSchedule',
    column: 'status',
    type: 'enum',
    enumValues: ['ON_TRACK', 'AT_RISK', 'IN_PROGRESS', 'RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'],
    operators: ENUM_OPS,
  },

  'premium.grossPremium': { entity: 'premium', column: 'grossPremium', type: 'number', operators: COMPARABLE_OPS },
  'premium.netPremium': { entity: 'premium', column: 'netPremium', type: 'number', operators: COMPARABLE_OPS },
  'premium.dueDate': { entity: 'premium', column: 'dueDate', type: 'date', operators: COMPARABLE_OPS },
  'premium.status': {
    entity: 'premium',
    column: 'status',
    type: 'enum',
    enumValues: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'],
    operators: ENUM_OPS,
  },

  'opportunity.amount': { entity: 'opportunity', column: 'amount', type: 'number', operators: COMPARABLE_OPS },
  'opportunity.lineOfBusiness': { entity: 'opportunity', column: 'lineOfBusiness', type: 'string', operators: STRING_OPS },
  'opportunity.expectedCloseDate': { entity: 'opportunity', column: 'expectedCloseDate', type: 'date', operators: COMPARABLE_OPS },
};

export interface SegmentFilterConditionInput {
  field: string;
  operator: string;
  value: unknown;
}

export interface SegmentFilterGroupInput {
  match: 'ALL' | 'ANY';
  conditions: SegmentFilterConditionInput[];
}

function coerceValue(type: SegmentFieldType, raw: unknown, enumValues: readonly string[] | undefined, fieldKey: string): unknown {
  if (type === 'date') {
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`Invalid date value for filter field "${fieldKey}"`);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date value for filter field "${fieldKey}"`);
    return d;
  }
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(n)) throw new Error(`Invalid numeric value for filter field "${fieldKey}"`);
    return n;
  }
  if (type === 'enum') {
    if (typeof raw !== 'string' || !enumValues?.includes(raw)) {
      throw new Error(`Invalid value for filter field "${fieldKey}" — must be one of: ${enumValues?.join(', ')}`);
    }
    return raw;
  }
  if (typeof raw !== 'string') throw new Error(`Invalid value for filter field "${fieldKey}" — expected a string`);
  return raw;
}

function buildScalarClause(spec: SegmentFieldSpec, operator: SegmentFilterOperatorValue, rawValue: unknown, fieldKey: string): Record<string, unknown> {
  if (operator === 'in' || operator === 'notIn') {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      throw new Error(`Filter field "${fieldKey}" with operator "${operator}" requires a non-empty array value`);
    }
    return { [operator]: rawValue.map((v) => coerceValue(spec.type, v, spec.enumValues, fieldKey)) };
  }
  const value = coerceValue(spec.type, rawValue, spec.enumValues, fieldKey);
  switch (operator) {
    case 'eq':
      return { equals: value };
    case 'neq':
      return { not: value };
    case 'gt':
      return { gt: value };
    case 'gte':
      return { gte: value };
    case 'lt':
      return { lt: value };
    case 'lte':
      return { lte: value };
    case 'contains':
      return { contains: value, mode: 'insensitive' };
    default:
      throw new Error(`Unsupported operator "${operator}" for filter field "${fieldKey}"`);
  }
}

interface ValidatedCondition {
  spec: SegmentFieldSpec;
  clause: Record<string, unknown>;
}

function validateCondition(condition: SegmentFilterConditionInput): ValidatedCondition {
  const spec = SEGMENT_FILTERABLE_FIELDS[condition.field];
  if (!spec) throw new Error(`Unknown filter field "${condition.field}" — not in the allowlist`);
  if (!spec.operators.includes(condition.operator as SegmentFilterOperatorValue)) {
    throw new Error(`Operator "${condition.operator}" is not allowed for filter field "${condition.field}"`);
  }
  return { spec, clause: buildScalarClause(spec, condition.operator as SegmentFilterOperatorValue, condition.value, condition.field) };
}

function isNonEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length > 0;
}

function mergeByEntity(conditions: ValidatedCondition[]): Record<SegmentFieldEntity, Record<string, unknown>> {
  const result: Record<SegmentFieldEntity, Record<string, unknown>> = {
    contact: {},
    account: {},
    policy: {},
    renewalSchedule: {},
    premium: {},
    opportunity: {},
  };
  for (const { spec, clause } of conditions) result[spec.entity][spec.column] = clause;
  return result;
}

function buildAllWhere(conditions: ValidatedCondition[]): Record<string, unknown> {
  const byEntity = mergeByEntity(conditions);
  const where: Record<string, unknown> = { ...byEntity.contact };

  const policyWhere: Record<string, unknown> = { ...byEntity.policy };
  if (isNonEmpty(byEntity.renewalSchedule)) policyWhere.renewalSchedule = byEntity.renewalSchedule;
  if (isNonEmpty(byEntity.premium)) policyWhere.premiums = { some: byEntity.premium };

  const accountWhere: Record<string, unknown> = { ...byEntity.account };
  if (isNonEmpty(policyWhere)) accountWhere.policies = { some: policyWhere };
  if (isNonEmpty(byEntity.opportunity)) accountWhere.opportunities = { some: byEntity.opportunity };

  if (isNonEmpty(accountWhere)) where.account = accountWhere;
  return where;
}

function buildAnyWhere(conditions: ValidatedCondition[]): Record<string, unknown> {
  const fragments = conditions.map(({ spec, clause }): Record<string, unknown> => {
    switch (spec.entity) {
      case 'contact':
        return { [spec.column]: clause };
      case 'account':
        return { account: { [spec.column]: clause } };
      case 'policy':
        return { account: { policies: { some: { [spec.column]: clause } } } };
      case 'renewalSchedule':
        return { account: { policies: { some: { renewalSchedule: { [spec.column]: clause } } } } };
      case 'premium':
        return { account: { policies: { some: { premiums: { some: { [spec.column]: clause } } } } } };
      case 'opportunity':
        return { account: { opportunities: { some: { [spec.column]: clause } } } };
    }
  });
  return { OR: fragments };
}

/** Compiles a validated AudienceSegment.filters JSON blob into a typed Prisma where clause — never build this from a raw string. */
export function buildContactWhereFromFilters(filters: SegmentFilterGroupInput): Prisma.ContactWhereInput {
  if (!filters.conditions || filters.conditions.length === 0) return {};
  const validated = filters.conditions.map(validateCondition);
  const where = filters.match === 'ANY' ? buildAnyWhere(validated) : buildAllWhere(validated);
  return where as unknown as Prisma.ContactWhereInput;
}
