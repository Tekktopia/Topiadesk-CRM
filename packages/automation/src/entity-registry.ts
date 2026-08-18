/**
 * What automation is allowed to see and touch, per entity type.
 *
 * Before this existed, automation knew about exactly two things — Case and
 * Claim — because the only consumer was the case-management event queue,
 * which hardcoded `payload.entityType === 'CLAIM' ? prisma.claim : prisma.case`
 * and an allowlist of seven case/claim field names. That made the whole CRM
 * side of the product (policies, opportunities, leads, accounts) invisible to
 * automation: there was no way to express "a policy expiring in 30 days" or
 * "an opportunity that hasn't moved in a fortnight", which are the rules a
 * brokerage actually wants.
 *
 * This registry is the single place that answers, for any entity type:
 * which Prisma model backs it, which fields a rule may filter on (and of
 * what kind, so the builder can render the right control and the evaluator
 * can coerce correctly), where a generated Task attaches, and how to reach a
 * human's email address from it.
 *
 * It lives in a shared package rather than in backend/api or backend/worker
 * because BOTH need it and they are separate deployables — the pre-existing
 * action-handler registry is duplicated between them for exactly that reason
 * (see action-handler.ts's header). Pure metadata and pure functions only:
 * no Prisma client, no side effects, nothing environment-specific — that is
 * what lets one copy serve both sides instead of drifting into two.
 */

export const AUTOMATION_ENTITY_TYPES = [
  'CASE',
  'CLAIM',
  'POLICY',
  'OPPORTUNITY',
  'LEAD',
  'TASK',
  'ACCOUNT',
  'CONTACT',
] as const;

export type AutomationEntityType = (typeof AUTOMATION_ENTITY_TYPES)[number];

export type FieldKind = 'enum' | 'string' | 'date' | 'number' | 'boolean' | 'uuid';

export interface EntityFieldMeta {
  name: string;
  label: string;
  kind: FieldKind;
  /** Populated for `kind: 'enum'` so the rule builder can offer real choices instead of a free-text box. */
  enumValues?: readonly string[];
  /** uuid fields that point at a User — lets the builder show a person picker. */
  refersTo?: 'User' | 'Team' | 'Account' | 'Carrier' | 'CaseCategory' | 'PipelineStage' | 'Industry' | 'Territory';
}

export interface EntityMeta {
  entityType: AutomationEntityType;
  label: string;
  /** Plural label, for "12 policies matched". */
  pluralLabel: string;
  /** Key of the delegate on PrismaClient — `prisma[model]`. */
  model: 'case' | 'claim' | 'policy' | 'opportunity' | 'lead' | 'task' | 'account' | 'contact';
  /** Field to show as the entity's name in logs and previews. */
  titleField: string;
  fields: readonly EntityFieldMeta[];
  /**
   * Field holding the person responsible. SEND_NOTIFICATION and
   * ASSIGN_TO_USER default to this, and the scheduled scanner uses it to
   * attribute generated work.
   */
  ownerField: string | null;
  /**
   * Which `Task` FK a CREATE_TASK action sets so the generated task hangs off
   * the entity that triggered it. Null means the task is created unattached.
   */
  taskLinkField: 'caseId' | 'claimId' | 'policyId' | 'opportunityId' | 'leadId' | 'accountId' | null;
  /**
   * How SEND_EMAIL resolves a recipient.
   *
   * 'self'    — the row carries its own email column (Lead, Contact).
   * 'contact' — a direct contact FK, falling back to the client's primary.
   * 'account' — via the client's primary contact.
   * 'policy'  — via the policy's client's primary contact. Claims have no
   *             account or contact FK of their own, so this two-hop walk is
   *             the only route to a human on them.
   * 'none'    — genuinely nobody to email.
   */
  emailSource: 'self' | 'contact' | 'account' | 'policy' | 'none';
}

const AUDIT_DATES = [
  { name: 'createdAt', label: 'Created', kind: 'date' as const },
  { name: 'updatedAt', label: 'Last updated', kind: 'date' as const },
];

export const ENTITY_REGISTRY: Record<AutomationEntityType, EntityMeta> = {
  CASE: {
    entityType: 'CASE',
    label: 'Ticket',
    pluralLabel: 'tickets',
    model: 'case',
    titleField: 'subject',
    ownerField: 'assignedToId',
    taskLinkField: 'caseId',
    emailSource: 'contact',
    fields: [
      { name: 'status', label: 'Status', kind: 'enum', enumValues: ['NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_CARRIER', 'RESOLVED', 'CLOSED', 'REOPENED'] },
      { name: 'priority', label: 'Priority', kind: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      { name: 'caseType', label: 'Type', kind: 'enum', enumValues: ['ENQUIRY', 'SERVICE_REQUEST', 'COMPLAINT'] },
      { name: 'categoryId', label: 'Category', kind: 'uuid', refersTo: 'CaseCategory' },
      { name: 'assignedToId', label: 'Assigned to', kind: 'uuid', refersTo: 'User' },
      { name: 'assignedTeamId', label: 'Assigned team', kind: 'uuid', refersTo: 'Team' },
      { name: 'accountId', label: 'Client', kind: 'uuid', refersTo: 'Account' },
      { name: 'subject', label: 'Subject', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  CLAIM: {
    entityType: 'CLAIM',
    label: 'Claim',
    pluralLabel: 'claims',
    model: 'claim',
    titleField: 'claimNumber',
    ownerField: 'adjusterId',
    taskLinkField: 'claimId',
    emailSource: 'policy',
    fields: [
      { name: 'status', label: 'Status', kind: 'enum', enumValues: ['NOTIFIED', 'UNDER_REVIEW', 'ADJUSTED', 'SETTLED', 'REPUDIATED', 'REOPENED', 'WITHDRAWN'] },
      { name: 'priority', label: 'Priority', kind: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      { name: 'adjusterId', label: 'Adjuster', kind: 'uuid', refersTo: 'User' },
      { name: 'assignedTeamId', label: 'Assigned team', kind: 'uuid', refersTo: 'Team' },
      { name: 'policyId', label: 'Policy', kind: 'uuid' },
      { name: 'claimNumber', label: 'Claim number', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  POLICY: {
    entityType: 'POLICY',
    label: 'Policy',
    pluralLabel: 'policies',
    model: 'policy',
    titleField: 'policyNumber',
    ownerField: 'brokerOfRecordId',
    taskLinkField: 'policyId',
    emailSource: 'account',
    fields: [
      { name: 'status', label: 'Status', kind: 'enum', enumValues: ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED', 'CANCELLED', 'LAPSED', 'RENEWED'] },
      { name: 'lineOfBusiness', label: 'Line of business', kind: 'string' },
      { name: 'expiryDate', label: 'Expiry date', kind: 'date' },
      { name: 'inceptionDate', label: 'Inception date', kind: 'date' },
      { name: 'sumInsured', label: 'Sum insured', kind: 'number' },
      { name: 'currency', label: 'Currency', kind: 'string' },
      { name: 'accountId', label: 'Client', kind: 'uuid', refersTo: 'Account' },
      { name: 'carrierId', label: 'Carrier', kind: 'uuid', refersTo: 'Carrier' },
      { name: 'brokerOfRecordId', label: 'Broker of record', kind: 'uuid', refersTo: 'User' },
      { name: 'policyNumber', label: 'Policy number', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  OPPORTUNITY: {
    entityType: 'OPPORTUNITY',
    label: 'Opportunity',
    pluralLabel: 'opportunities',
    model: 'opportunity',
    titleField: 'name',
    ownerField: 'ownerId',
    taskLinkField: 'opportunityId',
    emailSource: 'account',
    fields: [
      { name: 'pipelineStageId', label: 'Stage', kind: 'uuid', refersTo: 'PipelineStage' },
      { name: 'amount', label: 'Value', kind: 'number' },
      { name: 'probability', label: 'Probability (%)', kind: 'number' },
      { name: 'expectedCloseDate', label: 'Expected close', kind: 'date' },
      { name: 'actualCloseDate', label: 'Actual close', kind: 'date' },
      { name: 'ownerId', label: 'Owner', kind: 'uuid', refersTo: 'User' },
      { name: 'accountId', label: 'Client', kind: 'uuid', refersTo: 'Account' },
      { name: 'lineOfBusiness', label: 'Line of business', kind: 'string' },
      { name: 'dealHealthScore', label: 'Deal health score', kind: 'number' },
      { name: 'name', label: 'Name', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  LEAD: {
    entityType: 'LEAD',
    label: 'Lead',
    pluralLabel: 'leads',
    model: 'lead',
    titleField: 'lastName',
    ownerField: 'assignedToId',
    taskLinkField: 'leadId',
    emailSource: 'self',
    fields: [
      { name: 'status', label: 'Status', kind: 'enum', enumValues: ['NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'] },
      { name: 'score', label: 'Score', kind: 'number' },
      { name: 'source', label: 'Source', kind: 'string' },
      { name: 'assignedToId', label: 'Assigned to', kind: 'uuid', refersTo: 'User' },
      { name: 'companyName', label: 'Company', kind: 'string' },
      { name: 'email', label: 'Email', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  TASK: {
    entityType: 'TASK',
    label: 'Task',
    pluralLabel: 'tasks',
    model: 'task',
    titleField: 'title',
    ownerField: 'assigneeId',
    taskLinkField: null,
    emailSource: 'none',
    fields: [
      { name: 'status', label: 'Status', kind: 'enum', enumValues: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
      { name: 'priority', label: 'Priority', kind: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      { name: 'dueDate', label: 'Due date', kind: 'date' },
      { name: 'assigneeId', label: 'Assignee', kind: 'uuid', refersTo: 'User' },
      { name: 'completedAt', label: 'Completed', kind: 'date' },
      { name: 'title', label: 'Title', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  ACCOUNT: {
    entityType: 'ACCOUNT',
    label: 'Client',
    pluralLabel: 'clients',
    model: 'account',
    titleField: 'name',
    ownerField: 'ownerId',
    taskLinkField: 'accountId',
    emailSource: 'contact',
    fields: [
      { name: 'status', label: 'Status', kind: 'enum', enumValues: ['PROSPECT', 'CLIENT', 'FORMER_CLIENT'] },
      { name: 'accountType', label: 'Type', kind: 'enum', enumValues: ['INDIVIDUAL', 'CORPORATE', 'HOUSEHOLD'] },
      { name: 'riskRating', label: 'Risk rating', kind: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      { name: 'kycStatus', label: 'KYC status', kind: 'enum', enumValues: ['NOT_STARTED', 'PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED'] },
      { name: 'kycExpiryDate', label: 'KYC expiry', kind: 'date' },
      { name: 'ownerId', label: 'Owner', kind: 'uuid', refersTo: 'User' },
      { name: 'industryId', label: 'Industry', kind: 'uuid', refersTo: 'Industry' },
      { name: 'territoryId', label: 'Territory', kind: 'uuid', refersTo: 'Territory' },
      { name: 'healthScore', label: 'Health score', kind: 'number' },
      { name: 'isArchived', label: 'Archived', kind: 'boolean' },
      { name: 'name', label: 'Name', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
  CONTACT: {
    entityType: 'CONTACT',
    label: 'Contact',
    pluralLabel: 'contacts',
    model: 'contact',
    titleField: 'lastName',
    ownerField: null,
    taskLinkField: null,
    emailSource: 'self',
    fields: [
      { name: 'accountId', label: 'Client', kind: 'uuid', refersTo: 'Account' },
      { name: 'isPrimary', label: 'Primary contact', kind: 'boolean' },
      { name: 'title', label: 'Job title', kind: 'string' },
      { name: 'email', label: 'Email', kind: 'string' },
      ...AUDIT_DATES,
    ],
  },
};

export function getEntityMeta(entityType: string): EntityMeta | undefined {
  return ENTITY_REGISTRY[entityType as AutomationEntityType];
}

export function isAutomationEntityType(value: unknown): value is AutomationEntityType {
  return typeof value === 'string' && value in ENTITY_REGISTRY;
}

export function getFieldMeta(entityType: string, field: string): EntityFieldMeta | undefined {
  return getEntityMeta(entityType)?.fields.find((f) => f.name === field);
}

/**
 * Rows a rule is never allowed to act on, regardless of its conditions.
 *
 * Anonymised contacts are the load-bearing case: a DataSubjectRequest erasure
 * clears the personal fields but keeps the row for referential integrity, and
 * an automation that emailed or re-profiled one would undo the erasure the
 * firm is legally obliged to honour. Archived accounts are excluded for the
 * milder reason that they are deliberately out of circulation.
 */
export function baselineExclusions(entityType: AutomationEntityType): Record<string, unknown> {
  if (entityType === 'CONTACT') return { anonymizedAt: null };
  if (entityType === 'ACCOUNT') return { isArchived: false };
  return {};
}
