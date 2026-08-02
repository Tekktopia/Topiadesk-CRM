import type { ApiPaths } from '@topiadesk/shared-types';

/**
 * CRM data shapes for app/(crm)/**.
 *
 * Request bodies and query params are derived straight from the live
 * OpenAPI schema (`ApiPaths`, see packages/shared-types/src/api-client/
 * schema.d.ts) — those are precise (enums come through as literal unions,
 * e.g. `riskRating?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"`).
 *
 * Response shapes are HAND-MIRRORED from the backend response DTOs
 * (backend/api/src/modules/crm/dto/*.ts) instead of derived from `ApiPaths`,
 * because nestjs/swagger can't infer a concrete type for a bare
 * `@ApiProperty({ nullable: true }) foo!: string | null` property (no
 * explicit `type` given) and falls back to `type: object` — so the
 * generated schema types every nullable string/number field (riskRating,
 * industryId, city, email, ...) as `Record<string, never> | null` instead
 * of `string | null`. Using that directly would make every nullable field
 * on every response DTO effectively unusable without a cast at every call
 * site. Hand-mirroring here follows the same documented convention as
 * packages/shared-types/src/enums.ts and lib/auth/types.ts ("keep in sync
 * manually") — update this file if a backend/api/src/modules/crm/dto/*.ts
 * response shape changes.
 */

type Paths = ApiPaths;

// -- Accounts -----------------------------------------------------------

export interface Account {
  id: string;
  name: string;
  accountType: 'INDIVIDUAL' | 'CORPORATE';
  status: 'PROSPECT' | 'CLIENT' | 'FORMER_CLIENT';
  ownerId: string;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  industryId: string | null;
  parentAccountId: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
}

export interface AccountCounts {
  contacts: number;
  opportunities: number;
  tasks: number;
  policies: number;
  activities: number;
  relationships: number;
}

export interface AccountDetail extends Account {
  contacts: ContactSummary[];
  counts: AccountCounts;
}

export type AccountQuery = NonNullable<Paths['/crm/accounts']['get']['parameters']['query']>;
export type CreateAccountInput = Paths['/crm/accounts']['post']['requestBody']['content']['application/json'];
export type UpdateAccountInput = Paths['/crm/accounts/{id}']['patch']['requestBody']['content']['application/json'];

// -- Contacts -------------------------------------------------------------

export interface Contact {
  id: string;
  accountId: string | null;
  carrierId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export type ContactQuery = NonNullable<Paths['/crm/contacts']['get']['parameters']['query']>;
export type CreateContactInput = Paths['/crm/contacts']['post']['requestBody']['content']['application/json'];
export type UpdateContactInput = Paths['/crm/contacts/{id}']['patch']['requestBody']['content']['application/json'];

// -- Carriers ---------------------------------------------------------------

export interface Carrier {
  id: string;
  name: string;
  carrierType: 'INSURER' | 'REINSURER' | 'BOTH';
  amBestRating: string | null;
  linesOfBusiness: string[];
  panelStatus: string | null;
  treatyType: string | null;
  commissionTerms: string | null;
  createdAt: string;
}

export type CreateCarrierInput = Paths['/crm/carriers']['post']['requestBody']['content']['application/json'];
export type UpdateCarrierInput = Paths['/crm/carriers/{id}']['patch']['requestBody']['content']['application/json'];

// -- Leads ------------------------------------------------------------------

export interface Lead {
  id: string;
  source: 'WEB' | 'EMAIL' | 'REFERRAL' | 'PARTNER' | 'SOCIAL' | 'PHONE' | 'EVENT' | 'OTHER';
  sourceCampaign: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  score: number;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED';
  assignedToId: string | null;
  convertedAccountId: string | null;
  convertedOpportunityId: string | null;
  qualificationNotes: string | null;
  createdAt: string;
}

export interface ConvertLeadResponse {
  lead: Lead;
  accountId: string;
  opportunityId: string;
}

export type LeadQuery = NonNullable<Paths['/crm/leads']['get']['parameters']['query']>;
export type CreateLeadInput = Paths['/crm/leads']['post']['requestBody']['content']['application/json'];
export type UpdateLeadInput = Paths['/crm/leads/{id}']['patch']['requestBody']['content']['application/json'];
export type ConvertLeadInput = Paths['/crm/leads/{id}/convert']['post']['requestBody']['content']['application/json'];

// -- Pipelines / Stages -----------------------------------------------------

export interface Pipeline {
  id: string;
  name: string;
  lineOfBusiness: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  defaultProbability: number;
  isWon: boolean;
  isLost: boolean;
}

export interface PipelineDetail extends Pipeline {
  stages: PipelineStage[];
}

// -- Opportunities ------------------------------------------------------------

export interface Opportunity {
  id: string;
  accountId: string;
  name: string;
  pipelineStageId: string;
  /** Decimal amount serialized as a string, e.g. "45000000.00". */
  amount: string;
  probability: number;
  expectedCloseDate: string;
  actualCloseDate: string | null;
  wonReason: string | null;
  lostReason: string | null;
  ownerId: string;
  lineOfBusiness: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OpportunityQuery = NonNullable<Paths['/crm/opportunities']['get']['parameters']['query']>;
export type CreateOpportunityInput = Paths['/crm/opportunities']['post']['requestBody']['content']['application/json'];
export type UpdateOpportunityInput = Paths['/crm/opportunities/{id}']['patch']['requestBody']['content']['application/json'];
export type UpdateOpportunityStageInput =
  Paths['/crm/opportunities/{id}/stage']['patch']['requestBody']['content']['application/json'];

// -- Market submissions -------------------------------------------------------

export interface MarketSubmission {
  id: string;
  opportunityId: string;
  carrierId: string;
  quotedPremium: string | null;
  status: 'SUBMITTED' | 'DECLINED' | 'QUOTED' | 'BOUND';
  submittedAt: string;
  respondedAt: string | null;
  notes: string | null;
}

export type CreateMarketSubmissionInput =
  Paths['/crm/opportunities/{id}/market-submissions']['post']['requestBody']['content']['application/json'];

// -- Activities ---------------------------------------------------------------

export interface Activity {
  id: string;
  accountId: string | null;
  contactId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  policyId: string | null;
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'WHATSAPP' | 'PORTAL_MESSAGE' | 'SMS';
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  subject: string;
  body: string | null;
  occurredAt: string;
  createdById: string;
  durationMinutes: number | null;
  outcome: string | null;
  createdAt: string;
}

export type ActivityQuery = NonNullable<Paths['/crm/activities']['get']['parameters']['query']>;
export type CreateActivityInput = Paths['/crm/activities']['post']['requestBody']['content']['application/json'];

// -- Tasks ----------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assigneeId: string;
  accountId: string | null;
  policyId: string | null;
  opportunityId: string | null;
  leadId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskQuery = NonNullable<Paths['/crm/tasks']['get']['parameters']['query']>;
export type CreateTaskInput = Paths['/crm/tasks']['post']['requestBody']['content']['application/json'];
export type UpdateTaskInput = Paths['/crm/tasks/{id}']['patch']['requestBody']['content']['application/json'];

// -- Identity (read-only directory lookup for owner/assignee display) -------

export interface DirectoryUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
}
