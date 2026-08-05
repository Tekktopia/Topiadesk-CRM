import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
// NOT type-only: PublicKnowledgeArticleQueryDto is a @Query() parameter type
// (ValidationPipe needs the real class reference at runtime) — same footgun
// documented on KnowledgeArticleQueryDto in knowledge-articles.controller.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  PublicKnowledgeArticleDetailDto,
  PublicKnowledgeArticleListItemDto,
  PublicKnowledgeArticleQueryDto,
  PublicKnowledgeCategoryDto,
} from './dto/public-knowledge-article.dto';

interface ArticleForListItem {
  id: string;
  slug: string;
  title: string;
  categoryId: string | null;
  category: { name: string } | null;
  viewCount: number;
  helpfulCount: number;
  publishedAt: Date | null;
}

function toListItem(article: ArticleForListItem): PublicKnowledgeArticleListItemDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    categoryId: article.categoryId,
    categoryName: article.category?.name ?? null,
    viewCount: article.viewCount,
    helpfulCount: article.helpfulCount,
    publishedAt: article.publishedAt,
  };
}

/**
 * Public, unauthenticated knowledge base portal — gives `visibility:
 * CUSTOMER` (KnowledgeArticleVisibility) the functional meaning its schema
 * comment always intended. Every other KB endpoint
 * (knowledge-articles.controller.ts) requires a staff Bearer token, and its
 * RLS policy (`knowledge_articles_select` in prisma/rls/002_policies.sql)
 * only distinguishes "PUBLISHED, any staff member" from "DRAFT/IN_REVIEW/
 * ARCHIVED, owner or ALL-scope editor" — it never looks at `visibility` at
 * all, because until this controller existed there was no anonymous reader
 * for that column to mean anything to. Internal staff continue to see both
 * INTERNAL and CUSTOMER PUBLISHED articles unchanged through that endpoint;
 * this controller is purely additive.
 *
 * Excluded from RlsContextMiddleware in app.module.ts (same reasoning as
 * public/unsubscribe and public/live-chat — see those controllers' header
 * comments) — an anonymous website visitor has no bearer token to bind an
 * RLS context from, so every handler here binds SYSTEM_JOB_CONTEXT itself.
 *
 * SECURITY-CRITICAL, read before touching this file: SYSTEM_JOB_CONTEXT
 * makes `app_max_scope(..., 'write')` hardcode to 'ALL' for role
 * 'SYSTEM_JOB' (see app_max_scope() in prisma/rls/002_policies.sql), which
 * makes `knowledge_articles_select`'s USING clause's third OR branch
 * (`app_max_scope('knowledge_article', 'write') = 'ALL'`) true
 * unconditionally — RLS grants access to EVERY article regardless of
 * status/visibility under this context, i.e. RLS is fully bypassed here,
 * not narrowed. The explicit `status: 'PUBLISHED', visibility: 'CUSTOMER'`
 * clause in every Prisma `where` below is therefore the ONLY thing standing
 * between this controller and leaking DRAFT/IN_REVIEW/ARCHIVED/INTERNAL
 * articles to the open internet. It must stay an explicit, hardcoded filter
 * on every query here — never optional, never derived from a query param,
 * never removed "because RLS already covers it" (it doesn't, under this
 * context).
 */
@ApiTags('knowledge-base')
@Controller('public/knowledge')
export class PublicKnowledgeController {
  @Get('categories')
  @ApiOkResponse({ type: [PublicKnowledgeCategoryDto] })
  async listCategories(): Promise<PublicKnowledgeCategoryDto[]> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      // Only categories that actually have at least one PUBLISHED +
      // CUSTOMER article — an internal-only category's existence isn't
      // itself sensitive, but there's no reason to surface it to anonymous
      // traffic either.
      const categories = await getPrismaClient().knowledgeCategory.findMany({
        where: { articles: { some: { status: 'PUBLISHED', visibility: 'CUSTOMER' } } },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      });
      return categories.map((c) => ({ id: c.id, name: c.name, code: c.code }));
    });
  }

  @Get('articles')
  @ApiOkResponse({ type: [PublicKnowledgeArticleListItemDto] })
  async list(@Query() query: PublicKnowledgeArticleQueryDto): Promise<PublicKnowledgeArticleListItemDto[]> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const articles = await getPrismaClient().knowledgeArticle.findMany({
        where: {
          // Hardcoded, not sourced from `query` — see this file's header
          // comment. Do not change these two lines to spread from `query`.
          status: 'PUBLISHED',
          visibility: 'CUSTOMER',
          categoryId: query.categoryId,
          title: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
        },
        include: { category: true },
        orderBy: { publishedAt: 'desc' },
        take: query.take ?? 20,
        skip: query.skip ?? 0,
      });
      return articles.map(toListItem);
    });
  }

  @Get('articles/:slug')
  @ApiOkResponse({ type: PublicKnowledgeArticleDetailDto })
  async findBySlug(@Param('slug') slug: string): Promise<PublicKnowledgeArticleDetailDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const article = await prisma.knowledgeArticle.findFirst({
        // Hardcoded status/visibility — see this file's header comment.
        // findFirst (not findUnique) because slug alone isn't the unique
        // key being filtered on here; status/visibility narrow it and a
        // DRAFT/INTERNAL article sharing a slug with no PUBLISHED+CUSTOMER
        // counterpart correctly surfaces as "not found" below, exactly like
        // it would if it didn't exist at all.
        where: { slug, status: 'PUBLISHED', visibility: 'CUSTOMER' },
        include: { category: true, currentVersion: true },
      });
      if (!article) throw new NotFoundException('Article not found');

      // Fire-and-forget view counter, not awaited — a read should never
      // block on a write (same trade-off as
      // KnowledgeArticlesService.recordView() for the internal endpoint).
      // Already inside SYSTEM_JOB_CONTEXT here (no separate wrap needed,
      // unlike recordView()'s own nested runWithRlsContext call — that one
      // runs from a caller context that ISN'T already SYSTEM_JOB).
      prisma.knowledgeArticle
        .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
        .catch((err: unknown) => console.error(`[public-knowledge] failed to record view for article ${article.id}:`, err));

      return {
        ...toListItem(article),
        bodyMarkdown: article.currentVersion?.bodyMarkdown ?? '',
        updatedAt: article.updatedAt,
      };
    });
  }
}
