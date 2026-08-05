/**
 * Hand-mirrored copy of backend/api/src/modules/campaigns/segment-filters.ts's
 * SEGMENT_FILTERABLE_FIELDS allowlist — the real validation/compilation only
 * happens server-side (buildContactWhereFromFilters), this is purely so the
 * criteria builder can offer the right field/operator/value UI per field
 * instead of a raw JSON textarea. That file's DTO doc-comment references a
 * `GET /audience-segments/filterable-fields` endpoint for this exact
 * purpose, but no such route exists on AudienceSegmentsController today (see
 * that controller — only /, /:id, /:id/preview) — kept in sync by hand here
 * instead, same convention as the api/worker segment-filters.ts duplication
 * that file's own header comment documents. Update this if the backend
 * allowlist changes.
 */

export type SegmentFieldType = 'string' | 'number' | 'date' | 'enum';
export type SegmentFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'contains';

export interface SegmentFieldOption {
  field: string;
  entityLabel: string;
  fieldLabel: string;
  type: SegmentFieldType;
  enumValues?: readonly string[];
  operators: readonly SegmentFilterOperator[];
}

const STRING_OPS = ['eq', 'neq', 'contains', 'in', 'notIn'] as const;
const COMPARABLE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn'] as const;
const ENUM_OPS = ['eq', 'neq', 'in', 'notIn'] as const;

export const SEGMENT_FIELDS: readonly SegmentFieldOption[] = [
  { field: 'contact.firstName', entityLabel: 'Contact', fieldLabel: 'First name', type: 'string', operators: STRING_OPS },
  { field: 'contact.lastName', entityLabel: 'Contact', fieldLabel: 'Last name', type: 'string', operators: STRING_OPS },
  { field: 'contact.email', entityLabel: 'Contact', fieldLabel: 'Email', type: 'string', operators: STRING_OPS },
  { field: 'contact.phone', entityLabel: 'Contact', fieldLabel: 'Phone', type: 'string', operators: STRING_OPS },
  { field: 'contact.title', entityLabel: 'Contact', fieldLabel: 'Title', type: 'string', operators: STRING_OPS },

  { field: 'account.name', entityLabel: 'Account', fieldLabel: 'Name', type: 'string', operators: STRING_OPS },
  { field: 'account.accountType', entityLabel: 'Account', fieldLabel: 'Type', type: 'enum', enumValues: ['INDIVIDUAL', 'CORPORATE'], operators: ENUM_OPS },
  { field: 'account.status', entityLabel: 'Account', fieldLabel: 'Status', type: 'enum', enumValues: ['PROSPECT', 'CLIENT', 'FORMER_CLIENT'], operators: ENUM_OPS },
  { field: 'account.riskRating', entityLabel: 'Account', fieldLabel: 'Risk rating', type: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], operators: ENUM_OPS },
  { field: 'account.city', entityLabel: 'Account', fieldLabel: 'City', type: 'string', operators: STRING_OPS },
  { field: 'account.state', entityLabel: 'Account', fieldLabel: 'State', type: 'string', operators: STRING_OPS },
  { field: 'account.country', entityLabel: 'Account', fieldLabel: 'Country', type: 'string', operators: STRING_OPS },
  { field: 'account.annualRevenueBand', entityLabel: 'Account', fieldLabel: 'Annual revenue band', type: 'string', operators: STRING_OPS },

  { field: 'policy.lineOfBusiness', entityLabel: 'Policy', fieldLabel: 'Line of business', type: 'string', operators: STRING_OPS },
  {
    field: 'policy.status',
    entityLabel: 'Policy',
    fieldLabel: 'Status',
    type: 'enum',
    enumValues: ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'],
    operators: ENUM_OPS,
  },
  { field: 'policy.currency', entityLabel: 'Policy', fieldLabel: 'Currency', type: 'string', operators: STRING_OPS },
  { field: 'policy.inceptionDate', entityLabel: 'Policy', fieldLabel: 'Inception date', type: 'date', operators: COMPARABLE_OPS },
  { field: 'policy.expiryDate', entityLabel: 'Policy', fieldLabel: 'Expiry date', type: 'date', operators: COMPARABLE_OPS },
  { field: 'policy.sumInsured', entityLabel: 'Policy', fieldLabel: 'Sum insured', type: 'number', operators: COMPARABLE_OPS },

  { field: 'renewalSchedule.renewalDueDate', entityLabel: 'Renewal', fieldLabel: 'Renewal due date', type: 'date', operators: COMPARABLE_OPS },
  {
    field: 'renewalSchedule.status',
    entityLabel: 'Renewal',
    fieldLabel: 'Status',
    type: 'enum',
    enumValues: ['ON_TRACK', 'AT_RISK', 'IN_PROGRESS', 'RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'],
    operators: ENUM_OPS,
  },

  { field: 'premium.grossPremium', entityLabel: 'Premium', fieldLabel: 'Gross premium', type: 'number', operators: COMPARABLE_OPS },
  { field: 'premium.netPremium', entityLabel: 'Premium', fieldLabel: 'Net premium', type: 'number', operators: COMPARABLE_OPS },
  { field: 'premium.dueDate', entityLabel: 'Premium', fieldLabel: 'Due date', type: 'date', operators: COMPARABLE_OPS },
  { field: 'premium.status', entityLabel: 'Premium', fieldLabel: 'Status', type: 'enum', enumValues: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'], operators: ENUM_OPS },

  { field: 'opportunity.amount', entityLabel: 'Opportunity', fieldLabel: 'Amount', type: 'number', operators: COMPARABLE_OPS },
  { field: 'opportunity.lineOfBusiness', entityLabel: 'Opportunity', fieldLabel: 'Line of business', type: 'string', operators: STRING_OPS },
  { field: 'opportunity.expectedCloseDate', entityLabel: 'Opportunity', fieldLabel: 'Expected close date', type: 'date', operators: COMPARABLE_OPS },
] as const;

export const SEGMENT_FIELDS_BY_KEY: ReadonlyMap<string, SegmentFieldOption> = new Map(SEGMENT_FIELDS.map((f) => [f.field, f]));

export const OPERATOR_LABELS: Record<SegmentFilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is any of',
  notIn: 'is none of',
  contains: 'contains',
};
