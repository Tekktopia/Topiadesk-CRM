/**
 * Campaigns data shapes for app/(campaigns)/**.
 *
 * Hand-mirrored from backend/api/src/modules/campaigns/dto/*.ts response
 * DTOs and packages/db/prisma/schema.prisma's Phase 2 Campaign models —
 * NOT derived from `@topiadesk/shared-types`'s `ApiPaths` the way
 * app/(crm)/_lib/types.ts's request/query types are, because the generated
 * OpenAPI schema (packages/shared-types/src/api-client/schema.d.ts) has no
 * `/campaigns`, `/audience-segments`, or `/campaign-templates` paths in it
 * yet. Same "keep in sync manually" convention documented in that file and
 * in enums.ts.
 */

export type CampaignChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'PAUSED' | 'CANCELLED';
export type CampaignRecipientStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'FAILED' | 'UNSUBSCRIBED';
export type CampaignAbTestMetric = 'OPEN_RATE' | 'CLICK_RATE';

// -- Audience segments --------------------------------------------------

export interface SegmentFilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface SegmentFilterGroup {
  match: 'ALL' | 'ANY';
  conditions: SegmentFilterCondition[];
}

export interface AudienceSegment {
  id: string;
  name: string;
  description: string | null;
  /** Typed as `unknown` on the backend response DTO (raw Json column) — narrowed to SegmentFilterGroup here since buildContactWhereFromFilters is the only current writer and always produces this shape going forward. Real stored rows aren't guaranteed to match it though (a raw Json column has no DB-level schema, and at least one pre-existing row was found with an incompatible legacy shape, e.g. `{renewalWithinDays: 90}` instead of `{match, conditions}`) — every read goes through normalizeSegmentFilters below (wired in as each hook's `select`) so this invariant is actually true by the time any component sees it, instead of every consumer needing its own defensive check. */
  filters: SegmentFilterGroup;
  isDynamic: boolean;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Coerces whatever's actually stored in the raw Json filters column into a well-formed SegmentFilterGroup — an unrecognized/legacy shape degrades to "matches everyone" (empty conditions) rather than crashing the reader, mirroring buildContactWhereFromFilters' own `!filters.conditions -> {}` fallback on the backend. */
export function normalizeSegmentFilters(filters: unknown): SegmentFilterGroup {
  if (filters && typeof filters === 'object' && Array.isArray((filters as { conditions?: unknown }).conditions)) {
    const candidate = filters as SegmentFilterGroup;
    return { match: candidate.match === 'ANY' ? 'ANY' : 'ALL', conditions: candidate.conditions };
  }
  return { match: 'ALL', conditions: [] };
}

export interface CreateAudienceSegmentInput {
  name: string;
  description?: string;
  filters: SegmentFilterGroup;
  isDynamic?: boolean;
  ownerId?: string;
}

export type UpdateAudienceSegmentInput = Partial<CreateAudienceSegmentInput>;

export interface SegmentContactSample {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  accountId: string | null;
}

export interface SegmentPreviewResponse {
  count: number;
  sample: SegmentContactSample[];
}

// -- Campaign templates ---------------------------------------------------

export interface CampaignTemplate {
  id: string;
  name: string;
  channel: CampaignChannel;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  mergeFields: string[];
  whatsappTemplateName: string | null;
  whatsappTemplateLang: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignTemplateInput {
  name: string;
  channel: CampaignChannel;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  mergeFields?: string[];
  whatsappTemplateName?: string;
  whatsappTemplateLang?: string;
  isActive?: boolean;
}

export type UpdateCampaignTemplateInput = Partial<CreateCampaignTemplateInput>;

export interface MergeFieldDescriptor {
  key: string;
  label: string;
  example: string;
}

// -- Campaigns --------------------------------------------------------------

export interface CampaignVariant {
  id: string;
  label: string;
  templateId: string;
  splitPercent: number;
}

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  templateId: string | null;
  segmentId: string | null;
  scheduledSendAt: string | null;
  sentAt: string | null;
  abTestEnabled: boolean;
  abTestSamplePercent: number | null;
  abTestMetric: CampaignAbTestMetric | null;
  abTestWinnerVariantId: string | null;
  abTestDecidedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  variants?: CampaignVariant[];
}

export interface CreateCampaignVariantInput {
  label: string;
  templateId: string;
  splitPercent: number;
}

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  templateId?: string;
  segmentId: string;
  abTestEnabled?: boolean;
  abTestSamplePercent?: number;
  abTestMetric?: CampaignAbTestMetric;
  variants?: CreateCampaignVariantInput[];
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

/** Type alias (not interface) so it structurally satisfies buildQuery's Record parameter — interfaces get no implicit index signature. */
export type CampaignQuery = {
  status?: CampaignStatus;
  channel?: CampaignChannel;
};

export interface CampaignRecipient {
  id: string;
  contactId: string;
  variantId: string | null;
  status: CampaignRecipientStatus;
  externalMessageId: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
  failureReason: string | null;
}

export interface CampaignVariantPerformance {
  variantId: string;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface CampaignPerformance {
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  byVariant?: CampaignVariantPerformance[];
}

export interface AbTestDecideWinnerResponse {
  abTestWinnerVariantId: string;
  abTestDecidedAt: string;
  remainingRecipientsEnqueued: number;
}

// -- Suppressions -----------------------------------------------------------

/** Mirrors the CampaignSuppression Prisma model (no backend response DTO exists — see the suppressions page's header comment for the endpoint gap). */
export interface CampaignSuppression {
  id: string;
  contactId: string | null;
  emailOrPhone: string;
  channel: CampaignChannel;
  reason: string;
  createdAt: string;
}
