/**
 * Data shapes for app/(knowledge)/** — Knowledge Base + Surveys.
 *
 * HAND-MIRRORED from backend/api/src/modules/knowledge-base/dto/*.ts and
 * backend/api/src/modules/surveys/dto/*.ts, not derived from
 * `@topiadesk/shared-types`'s generated `ApiPaths`: that schema
 * (packages/shared-types/src/api-client/schema.d.ts) has no `/knowledge/**`
 * or `/surveys/**` entries yet — it wasn't regenerated for this Phase 2
 * backend build. Same "keep in sync manually" convention documented in
 * app/(crm)/_lib/types.ts and packages/shared-types/src/enums.ts; update
 * this file if a backend DTO shape changes.
 */

// -- Knowledge categories ----------------------------------------------------

export type KnowledgeCategory = {
  id: string;
  name: string;
  code: string;
  parentCategoryId: string | null;
  order: number;
  createdAt: string;
};

export type CreateKnowledgeCategoryInput = {
  name: string;
  code: string;
  parentCategoryId?: string;
  order?: number;
};

export type UpdateKnowledgeCategoryInput = Partial<CreateKnowledgeCategoryInput>;

// -- Knowledge articles -------------------------------------------------------

export type KnowledgeArticleStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type KnowledgeArticleVisibility = 'INTERNAL' | 'CUSTOMER';
export type KnowledgeFeedbackVote = 'HELPFUL' | 'NOT_HELPFUL';

export type KnowledgeArticle = {
  id: string;
  categoryId: string | null;
  slug: string;
  title: string;
  status: KnowledgeArticleStatus;
  visibility: KnowledgeArticleVisibility;
  locale: string;
  translationGroupId: string | null;
  currentVersionId: string | null;
  ownerId: string;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeArticleQuery = {
  categoryId?: string;
  status?: KnowledgeArticleStatus;
  locale?: string;
  visibility?: KnowledgeArticleVisibility;
  /** Case-insensitive substring match on title — backend's real search param
   * (KnowledgeArticlesService.list()), not a client-side filter. */
  q?: string;
};

export type CreateKnowledgeArticleInput = {
  categoryId?: string;
  slug: string;
  title: string;
  visibility?: KnowledgeArticleVisibility;
  locale?: string;
  translationGroupId?: string;
  bodyMarkdown: string;
};

export type KnowledgeArticleVersion = {
  id: string;
  articleId: string;
  versionNumber: number;
  bodyMarkdown: string;
  changeNote: string | null;
  authoredById: string;
  createdAt: string;
};

export type CreateKnowledgeArticleVersionInput = {
  bodyMarkdown: string;
  changeNote?: string;
};

export type KnowledgeArticleFeedback = {
  id: string;
  articleId: string;
  userId: string;
  vote: KnowledgeFeedbackVote;
  comment: string | null;
  caseId: string | null;
  createdAt: string;
};

export type UpsertKnowledgeArticleFeedbackInput = {
  vote: KnowledgeFeedbackVote;
  comment?: string;
  caseId?: string;
};

export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export type DecideKnowledgeApprovalInput = {
  decision: ApprovalDecision;
  reason?: string;
};

// -- Surveys ------------------------------------------------------------------

export type SurveyType = 'CSAT' | 'NPS' | 'CES';
export type SurveyTriggerEvent = 'CASE_RESOLVED' | 'CLAIM_SETTLED' | 'POLICY_ISSUED' | 'POLICY_RENEWED' | 'MANUAL';
export type SurveyResponseChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PORTAL';

export type Survey = {
  id: string;
  name: string;
  type: SurveyType;
  triggerEvent: SurveyTriggerEvent;
  questionText: string;
  scaleMin: number;
  scaleMax: number;
  isActive: boolean;
  sendDelayMinutes: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type SurveyQuery = {
  type?: SurveyType;
  isActive?: boolean;
};

export type CreateSurveyInput = {
  name: string;
  type: SurveyType;
  triggerEvent: SurveyTriggerEvent;
  questionText: string;
  scaleMin?: number;
  scaleMax: number;
  isActive?: boolean;
  sendDelayMinutes?: number;
};

export type UpdateSurveyInput = Partial<CreateSurveyInput>;

/** respondToken is never included here — GET /surveys/:id/responses strips it
 * server-side (SurveyResponseRecordDto's header comment); it's a bearer
 * credential, not display data. */
export type SurveyResponseRecord = {
  id: string;
  surveyId: string;
  triggerEntityType: string;
  triggerEntityId: string;
  accountId: string | null;
  respondentContactId: string | null;
  agentId: string | null;
  channel: SurveyResponseChannel;
  score: number | null;
  comment: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
};

export type SurveyResponseQuery = {
  agentId?: string;
  from?: string;
  to?: string;
};

export type SubmitSurveyResponseInput = {
  respondToken: string;
  score: number;
  comment?: string;
};
