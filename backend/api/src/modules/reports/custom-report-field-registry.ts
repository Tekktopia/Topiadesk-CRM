/**
 * The allow-list backing the ad-hoc "Custom Reports" builder
 * (custom-report.controller.ts) — the Zendesk Explore / Freshdesk Analytics
 * -style flexible query surface the fixed 12-report registry
 * (registry/report-definition.ts) deliberately doesn't offer, for the exact
 * injection-safety reason documented on that file and in
 * docs/comparison-topiadesk-vs-freshdesk-vs-zendesk.md (differentiator #7).
 *
 * This registry is what makes the flexible builder safe to add without
 * contradicting that differentiator: every entity/field the controller will
 * ever put into a Prisma `select`/`where`/`groupBy` call is a hardcoded key
 * in the object below, never a request-supplied string used directly.
 * `custom-report.controller.ts` validates every incoming entity/field/
 * groupBy value against this registry BEFORE building a Prisma call — there
 * is no code path where an unvalidated request string reaches Prisma.
 */

export type CustomReportFieldType = 'string' | 'number' | 'date' | 'enum' | 'boolean';

export interface CustomReportField {
  /** Stable key exposed to the frontend/request body — not necessarily the same as the Prisma field name (kept 1:1 here for simplicity, but the indirection is what lets us rename API-facing keys later without a Prisma-level migration). */
  key: string;
  /** The actual Prisma scalar field name on this entity's model — this is what's allowed to reach `select`/`where`/`groupBy`. */
  prismaField: string;
  label: string;
  type: CustomReportFieldType;
  filterable: boolean;
  groupable: boolean;
}

export interface CustomReportEntity {
  /** Prisma client delegate name, e.g. `getPrismaClient().account` — the ONLY entities a custom report may query are the keys of CUSTOM_REPORT_REGISTRY below. */
  prismaModel: string;
  label: string;
  fields: CustomReportField[];
}

function f(key: string, type: CustomReportFieldType, label: string, opts: { filterable?: boolean; groupable?: boolean; prismaField?: string } = {}): CustomReportField {
  return {
    key,
    prismaField: opts.prismaField ?? key,
    label,
    type,
    filterable: opts.filterable ?? true,
    groupable: opts.groupable ?? (type === 'enum' || type === 'boolean' || type === 'string'),
  };
}

export const CUSTOM_REPORT_REGISTRY: Record<string, CustomReportEntity> = {
  account: {
    prismaModel: 'account',
    label: 'Accounts',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('name', 'string', 'Name', { groupable: false }),
      f('accountType', 'enum', 'Type'),
      f('status', 'enum', 'Status'),
      f('riskRating', 'enum', 'Risk rating'),
      f('annualRevenueBand', 'string', 'Revenue band'),
      f('city', 'string', 'City'),
      f('state', 'string', 'State'),
      f('country', 'string', 'Country'),
      f('ownerId', 'string', 'Owner', { groupable: true }),
      f('createdAt', 'date', 'Created'),
      f('updatedAt', 'date', 'Updated'),
    ],
  },
  contact: {
    prismaModel: 'contact',
    label: 'Contacts',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('firstName', 'string', 'First name', { groupable: false }),
      f('lastName', 'string', 'Last name', { groupable: false }),
      f('email', 'string', 'Email', { groupable: false }),
      f('isPrimary', 'boolean', 'Primary contact'),
      f('accountId', 'string', 'Account'),
      f('createdAt', 'date', 'Created'),
    ],
  },
  opportunity: {
    prismaModel: 'opportunity',
    label: 'Opportunities',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('name', 'string', 'Name', { groupable: false }),
      f('amount', 'number', 'Amount'),
      f('probability', 'number', 'Probability %'),
      f('lineOfBusiness', 'string', 'Line of business'),
      f('expectedCloseDate', 'date', 'Expected close'),
      f('actualCloseDate', 'date', 'Actual close'),
      f('ownerId', 'string', 'Owner'),
      f('accountId', 'string', 'Account'),
      f('pipelineStageId', 'string', 'Pipeline stage'),
      f('createdAt', 'date', 'Created'),
    ],
  },
  policy: {
    prismaModel: 'policy',
    label: 'Policies',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('policyNumber', 'string', 'Policy number', { groupable: false }),
      f('lineOfBusiness', 'string', 'Line of business'),
      f('status', 'enum', 'Status'),
      f('currency', 'string', 'Currency'),
      f('sumInsured', 'number', 'Sum insured'),
      f('inceptionDate', 'date', 'Inception date'),
      f('expiryDate', 'date', 'Expiry date'),
      f('carrierId', 'string', 'Carrier'),
      f('accountId', 'string', 'Account'),
      f('brokerOfRecordId', 'string', 'Broker of record'),
      f('createdAt', 'date', 'Created'),
    ],
  },
  claim: {
    prismaModel: 'claim',
    label: 'Claims',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('claimNumber', 'string', 'Claim number', { groupable: false }),
      f('status', 'enum', 'Status'),
      f('priority', 'enum', 'Priority'),
      f('dateOfLoss', 'date', 'Date of loss'),
      f('dateReported', 'date', 'Date reported'),
      f('reserveAmount', 'number', 'Reserve amount'),
      f('settledAmount', 'number', 'Settled amount'),
      f('policyId', 'string', 'Policy'),
      f('adjusterId', 'string', 'Adjuster'),
      f('causeOfLossCategoryId', 'string', 'Loss cause category'),
      f('createdAt', 'date', 'Created'),
    ],
  },
  case: {
    prismaModel: 'case',
    label: 'Cases',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('caseNumber', 'string', 'Case number', { groupable: false }),
      f('caseType', 'enum', 'Type'),
      f('status', 'enum', 'Status'),
      f('priority', 'enum', 'Priority'),
      f('assignedToId', 'string', 'Assigned to'),
      f('assignedTeamId', 'string', 'Assigned team'),
      f('categoryId', 'string', 'Category'),
      f('reopenCount', 'number', 'Reopen count'),
      f('resolvedAt', 'date', 'Resolved at'),
      f('closedAt', 'date', 'Closed at'),
      f('createdAt', 'date', 'Created'),
    ],
  },
  campaign: {
    prismaModel: 'campaign',
    label: 'Campaigns',
    fields: [
      f('id', 'string', 'ID', { filterable: false, groupable: false }),
      f('name', 'string', 'Name', { groupable: false }),
      f('channel', 'enum', 'Channel'),
      f('status', 'enum', 'Status'),
      f('abTestEnabled', 'boolean', 'A/B test enabled'),
      f('scheduledSendAt', 'date', 'Scheduled send'),
      f('sentAt', 'date', 'Sent at'),
      f('createdById', 'string', 'Created by'),
      f('createdAt', 'date', 'Created'),
    ],
  },
};

export type CustomReportFilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';

export function getEntityOrThrow(entity: string): CustomReportEntity {
  const def = CUSTOM_REPORT_REGISTRY[entity];
  if (!def) {
    throw new Error(`Unknown custom report entity "${entity}" — must be one of: ${Object.keys(CUSTOM_REPORT_REGISTRY).join(', ')}`);
  }
  return def;
}

export function getFieldOrThrow(def: CustomReportEntity, fieldKey: string): CustomReportField {
  const field = def.fields.find((fld) => fld.key === fieldKey);
  if (!field) {
    throw new Error(`Unknown field "${fieldKey}" for entity "${def.label}" — must be one of: ${def.fields.map((fld) => fld.key).join(', ')}`);
  }
  return field;
}
