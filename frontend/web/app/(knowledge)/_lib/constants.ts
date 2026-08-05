import type { KnowledgeArticleStatus, KnowledgeArticleVisibility, SurveyTriggerEvent, SurveyType } from './types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';

export const ARTICLE_STATUSES: KnowledgeArticleStatus[] = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'];

const ARTICLE_STATUS_VARIANT: Record<KnowledgeArticleStatus, BadgeVariant> = {
  DRAFT: 'secondary',
  IN_REVIEW: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'outline',
};

export function articleStatusVariant(status: KnowledgeArticleStatus): BadgeVariant {
  return ARTICLE_STATUS_VARIANT[status] ?? 'outline';
}

export function articleStatusLabel(status: KnowledgeArticleStatus): string {
  return status === 'IN_REVIEW' ? 'In review' : status.charAt(0) + status.slice(1).toLowerCase();
}

export const ARTICLE_VISIBILITIES: KnowledgeArticleVisibility[] = ['INTERNAL', 'CUSTOMER'];

export function visibilityLabel(visibility: KnowledgeArticleVisibility): string {
  return visibility === 'INTERNAL' ? 'Internal only' : 'Customer-visible';
}

export function visibilityVariant(visibility: KnowledgeArticleVisibility): BadgeVariant {
  return visibility === 'CUSTOMER' ? 'warning' : 'secondary';
}

export const SURVEY_TYPES: SurveyType[] = ['CSAT', 'NPS', 'CES'];

export const SURVEY_TYPE_LABEL: Record<SurveyType, string> = {
  CSAT: 'CSAT — Customer Satisfaction',
  NPS: 'NPS — Net Promoter Score',
  CES: 'CES — Customer Effort Score',
};

export const SURVEY_TRIGGER_EVENTS: SurveyTriggerEvent[] = [
  'CASE_RESOLVED',
  'CLAIM_SETTLED',
  'POLICY_ISSUED',
  'POLICY_RENEWED',
  'MANUAL',
];

export const SURVEY_TRIGGER_EVENT_LABEL: Record<SurveyTriggerEvent, string> = {
  CASE_RESOLVED: 'Case resolved',
  CLAIM_SETTLED: 'Claim settled',
  POLICY_ISSUED: 'Policy issued',
  POLICY_RENEWED: 'Policy renewed',
  MANUAL: 'Manual / ad hoc',
};
