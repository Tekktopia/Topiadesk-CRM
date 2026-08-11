/**
 * Data shapes for the public knowledge portal (app/(knowledge)/kb/**).
 * HAND-MIRRORED from backend/api/src/modules/knowledge-base/dto/
 * public-knowledge-article.dto.ts, same "keep in sync manually" convention
 * as ../../_lib/types.ts (the internal KB's own copy) — deliberately a
 * separate, narrower set of types rather than importing from there: the
 * public endpoints return a different (smaller) field set than the internal
 * ones (no ownerId, no status/visibility echoed back, etc.) by design, see
 * that DTO file's header comment.
 */

export type PublicKnowledgeCategory = {
  id: string;
  name: string;
  code: string;
};

export type PublicKnowledgeArticleListItem = {
  id: string;
  slug: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  viewCount: number;
  helpfulCount: number;
  publishedAt: string | null;
};

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
