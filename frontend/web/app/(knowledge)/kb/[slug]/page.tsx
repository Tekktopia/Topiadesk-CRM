import { KbArticleView } from './kb-article-view';

/**
 * Public article detail page — see ../page.tsx's header comment for the
 * shared context (anonymous access, no nav.ts entry, middleware.ts
 * exclusion, known app-shell limitation). `slug` is passed straight through
 * to GET /api/public/knowledge/articles/[slug], which forwards to
 * public-knowledge.controller.ts#findBySlug — that handler is the one
 * enforcing `status: 'PUBLISHED', visibility: 'CUSTOMER'`; a DRAFT/INTERNAL
 * article's slug 404s here exactly like a nonexistent one, by design (see
 * that handler's own comment on findFirst() vs findUnique()).
 */
export default async function KnowledgeBaseArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KbArticleView slug={slug} />;
}
