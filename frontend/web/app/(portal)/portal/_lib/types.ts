export interface PortalMe {
  contactName: string;
  accountName: string;
}

export interface PortalPolicy {
  id: string;
  policyNumber: string;
  lineOfBusiness: string;
  status: string;
  sumInsured: string | null;
  currency: string;
  inceptionDate: string;
  expiryDate: string;
}

export interface PortalCase {
  id: string;
  caseNumber: string;
  caseType: string;
  subject: string;
  description?: string | null;
  status: string;
  createdAt: string;
}

export interface PortalCaseComment {
  id: string;
  subject: string;
  body?: string | null;
  direction: string;
  authorLabel: string;
  occurredAt: string;
}

export interface PortalDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CreatePortalCaseInput {
  caseType: string;
  subject: string;
  description?: string;
}

export interface CreatePortalCaseCommentInput {
  body: string;
}

/**
 * Public Knowledge Base shapes — HAND-MIRRORED from backend/api's
 * public-knowledge-article.dto.ts, same "keep in sync manually" convention
 * as app/(knowledge)/kb/_lib/types.ts's identical copy (these two route
 * groups both call the same truly-public `/api/public/knowledge/**` BFF
 * routes directly, no portal-specific proxy needed — see
 * PublicKnowledgeCategory's own header comment there for why).
 */
export interface PublicKnowledgeCategory {
  id: string;
  name: string;
  code: string;
}

export interface PublicKnowledgeArticleListItem {
  id: string;
  slug: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  viewCount: number;
  helpfulCount: number;
  publishedAt: string | null;
}

export type PublicKnowledgeArticleDetail = PublicKnowledgeArticleListItem & {
  bodyMarkdown: string;
  updatedAt: string;
};

export type PublicKnowledgeArticleQuery = {
  q?: string;
  categoryId?: string;
  take?: number;
  skip?: number;
};

export type PublicKnowledgeVote = 'HELPFUL' | 'NOT_HELPFUL';
