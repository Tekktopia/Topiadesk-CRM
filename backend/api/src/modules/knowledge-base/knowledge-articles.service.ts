import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getPrismaClient,
  runWithRlsContext,
  SYSTEM_JOB_CONTEXT,
  type KnowledgeArticle,
  type KnowledgeArticleFeedback,
  type KnowledgeArticleStatus,
  type KnowledgeArticleVersion,
  type KnowledgeArticleVisibility,
  type KnowledgeFeedbackVote,
} from '@topiadesk/db';

export interface KnowledgeArticleListFilter {
  categoryId?: string;
  status?: KnowledgeArticleStatus;
  locale?: string;
  visibility?: KnowledgeArticleVisibility;
  q?: string;
}

export interface CreateKnowledgeArticleInput {
  categoryId?: string;
  slug: string;
  title: string;
  visibility?: KnowledgeArticleVisibility;
  locale?: string;
  translationGroupId?: string;
  bodyMarkdown: string;
}

export interface AddKnowledgeArticleVersionInput {
  bodyMarkdown: string;
  changeNote?: string;
}

export interface UpsertKnowledgeArticleFeedbackInput {
  vote: KnowledgeFeedbackVote;
  comment?: string;
  caseId?: string;
}

export interface KnowledgeArticleAnalytics {
  articleId: string;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulRatio: number | null;
}

@Injectable()
export class KnowledgeArticlesService {
  async list(filter: KnowledgeArticleListFilter): Promise<KnowledgeArticle[]> {
    return getPrismaClient().knowledgeArticle.findMany({
      where: {
        categoryId: filter.categoryId,
        status: filter.status,
        locale: filter.locale,
        visibility: filter.visibility,
        title: filter.q ? { contains: filter.q, mode: 'insensitive' } : undefined,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string): Promise<KnowledgeArticle> {
    const article = await getPrismaClient().knowledgeArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Knowledge article not found');
    return article;
  }

  /**
   * Fire-and-forget view counter, deliberately not awaited by the caller
   * (KnowledgeArticlesController.findOne) — a read should never block on a
   * write, and a lost increment on rare contention/failure is an
   * acceptable trade for that. Errors are swallowed to console.error only,
   * matching how documents.service.ts treats storage as best-effort
   * outside the primary write path.
   *
   * Runs under SYSTEM_JOB_CONTEXT, not the caller's own bound context —
   * same reasoning and same empirically-confirmed failure as the counter
   * sync in upsertFeedback() below: GET .../articles/:id carries no
   * @RequirePermission (any authenticated user may read a PUBLISHED
   * article per knowledge_articles_select), but `knowledge_articles_write`
   * only permits owner-or-ALL-scope writes — a non-owner, no-grant reader
   * would otherwise have this UPDATE silently RLS-denied (Prisma P2025)
   * on every view.
   */
  recordView(id: string): void {
    runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().knowledgeArticle.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
    ).catch((err: unknown) => console.error(`[knowledge-base] failed to record view for article ${id}:`, err));
  }

  async listVersions(articleId: string): Promise<KnowledgeArticleVersion[]> {
    await this.findOne(articleId);
    return getPrismaClient().knowledgeArticleVersion.findMany({ where: { articleId }, orderBy: { versionNumber: 'asc' } });
  }

  /**
   * Writes the article's DRAFT row and its version-1 row as two sequential
   * calls with manual compensation on failure, not `$transaction([...])` —
   * the batched-array form doesn't propagate the RLS-context set_config
   * step through the Proxy wrapper (packages/db/src/client.ts's header
   * comment; leads.controller.ts's convert() is the established
   * sequential-calls-plus-compensation precedent this mirrors).
   */
  async create(dto: CreateKnowledgeArticleInput, ownerId: string): Promise<KnowledgeArticle> {
    const prisma = getPrismaClient();
    const articleId = randomUUID();
    await prisma.knowledgeArticle.create({
      data: {
        id: articleId,
        categoryId: dto.categoryId,
        slug: dto.slug,
        title: dto.title,
        visibility: dto.visibility,
        locale: dto.locale,
        translationGroupId: dto.translationGroupId,
        ownerId,
      },
    });

    try {
      const version = await prisma.knowledgeArticleVersion.create({
        data: { articleId, versionNumber: 1, bodyMarkdown: dto.bodyMarkdown, authoredById: ownerId },
      });
      return await prisma.knowledgeArticle.update({ where: { id: articleId }, data: { currentVersionId: version.id } });
    } catch (err) {
      await prisma.knowledgeArticle.delete({ where: { id: articleId } }).catch(() => undefined);
      throw err;
    }
  }

  /**
   * New edit -> new version, promoted to currentVersionId immediately.
   * Only DRAFT articles are freely editable this way — publish is the one
   * gated step (schema comment on the Phase 2 KB section); IN_REVIEW/
   * PUBLISHED/ARCHIVED articles can't have their content silently swapped
   * out from under an in-flight or already-live approval.
   */
  async addVersion(articleId: string, dto: AddKnowledgeArticleVersionInput, authoredById: string): Promise<KnowledgeArticle> {
    const prisma = getPrismaClient();
    const article = await this.findOne(articleId);
    if (article.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot add a version while article status is ${article.status} — only DRAFT articles are freely editable`);
    }

    const maxVersion = await prisma.knowledgeArticleVersion.aggregate({ where: { articleId }, _max: { versionNumber: true } });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;
    const version = await prisma.knowledgeArticleVersion.create({
      data: { articleId, versionNumber, bodyMarkdown: dto.bodyMarkdown, changeNote: dto.changeNote, authoredById },
    });
    return prisma.knowledgeArticle.update({ where: { id: articleId }, data: { currentVersionId: version.id } });
  }

  async submitForReview(articleId: string, requestedById: string): Promise<KnowledgeArticle> {
    const prisma = getPrismaClient();
    const article = await this.findOne(articleId);
    if (article.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot submit for review from status ${article.status}`);
    }
    if (!article.currentVersionId) {
      throw new BadRequestException('Article has no version to publish yet');
    }

    const existingPending = await prisma.approval.findFirst({
      where: { entityType: 'KNOWLEDGE_ARTICLE_PUBLISH', entityId: articleId, status: 'PENDING' },
    });
    if (existingPending) throw new ConflictException('A publish approval is already pending for this article');

    await prisma.approval.create({
      data: { entityType: 'KNOWLEDGE_ARTICLE_PUBLISH', entityId: articleId, requestedById, status: 'PENDING' },
    });
    return prisma.knowledgeArticle.update({ where: { id: articleId }, data: { status: 'IN_REVIEW' } });
  }

  /**
   * The sole path to PUBLISHED. There is deliberately no direct
   * "publish now" endpoint a caller can hit outright — that would bypass
   * the maker-checker gate the schema comment calls out
   * (KNOWLEDGE_ARTICLE_PUBLISH shares the Approval table ENDORSEMENT/
   * CANCELLATION already use). This mirrors
   * PolicyVersionController.decideApproval() exactly: look up the PENDING
   * Approval by (entityType, entityId), enforce segregation of duties,
   * then apply the entity-specific effect inline in the same method —
   * this codebase has no separate "Approvals module" dispatching decisions
   * out to other modules' handlers by entityType; each gated domain owns
   * its own `.../decision` endpoint, exactly like PolicyVersion's.
   */
  async decideApproval(
    articleId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | undefined,
    decidedById: string,
  ): Promise<KnowledgeArticle> {
    const prisma = getPrismaClient();
    const article = await this.findOne(articleId);
    if (article.status !== 'IN_REVIEW') {
      throw new BadRequestException(`Article is not awaiting a publish decision (status ${article.status})`);
    }

    const approval = await prisma.approval.findFirst({
      where: { entityType: 'KNOWLEDGE_ARTICLE_PUBLISH', entityId: articleId, status: 'PENDING' },
    });
    if (!approval) throw new NotFoundException('No pending publish approval for this article');
    // Segregation of duties (BRD NFR, same as PolicyVersionController) —
    // the approvals_requester_ne_approver DB CHECK constraint would also
    // reject this, but a clear 403 here beats a raw constraint violation
    // surfacing as a 500.
    if (approval.requestedById === decidedById) {
      throw new ForbiddenException('Cannot decide your own approval request');
    }

    if (decision === 'APPROVED') {
      await prisma.approval.update({
        where: { id: approval.id },
        data: { status: 'APPROVED', approvedById: decidedById, decidedAt: new Date(), reason },
      });
      return prisma.knowledgeArticle.update({
        where: { id: articleId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }

    await prisma.approval.update({
      where: { id: approval.id },
      data: { status: 'REJECTED', approvedById: decidedById, decidedAt: new Date(), reason },
    });
    // Back to DRAFT, not left in IN_REVIEW — a rejected article is
    // immediately editable again for resubmission, not stuck in limbo.
    return prisma.knowledgeArticle.update({ where: { id: articleId }, data: { status: 'DRAFT' } });
  }

  async archive(articleId: string): Promise<KnowledgeArticle> {
    const article = await this.findOne(articleId);
    if (article.status === 'ARCHIVED') throw new ConflictException('Article is already archived');
    return getPrismaClient().knowledgeArticle.update({
      where: { id: articleId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  /**
   * Upsert on (articleId, userId) — the schema's unique constraint IS the
   * one-vote-per-user rule; changing your mind is an UPDATE to the same
   * row, not a second one (captured by the generic audit trigger like any
   * other update). helpfulCount/notHelpfulCount on the article are kept in
   * sync with an incremental delta rather than a re-COUNT(*), the same
   * "denormalize for cheap reads, sync explicitly on write" trade-off
   * Document.fileName/mimeType/sizeBytes make for their current version.
   */
  async upsertFeedback(articleId: string, userId: string, dto: UpsertKnowledgeArticleFeedbackInput): Promise<KnowledgeArticleFeedback> {
    const prisma = getPrismaClient();
    await this.findOne(articleId);

    const existing = await prisma.knowledgeArticleFeedback.findUnique({ where: { articleId_userId: { articleId, userId } } });
    const feedback = await prisma.knowledgeArticleFeedback.upsert({
      where: { articleId_userId: { articleId, userId } },
      create: { articleId, userId, vote: dto.vote, comment: dto.comment, caseId: dto.caseId },
      update: { vote: dto.vote, comment: dto.comment, caseId: dto.caseId },
    });

    const deltas = feedbackCounterDeltas(existing?.vote, dto.vote);
    if (deltas.helpfulCount !== 0 || deltas.notHelpfulCount !== 0) {
      // `knowledge_articles_write`'s WITH CHECK is owner-or-ALL-scope only
      // — any authenticated user can leave feedback on a PUBLISHED article
      // they don't own and have no KB grant for (knowledge_article_feedback_rw
      // is self-scoped, not ownership-gated), so under THEIR OWN context
      // this denormalized counter sync on the parent article would be
      // RLS-denied. Confirmed empirically: a non-owner, no-grant user's
      // feedback call failed with Prisma P2025 ("record not found", RLS's
      // fail-closed signature) until this was wrapped in SYSTEM_JOB_CONTEXT.
      // Same reasoning as SurveysService.createSurveyResponse()'s wrap:
      // this is bookkeeping on data the caller doesn't own, not their own
      // content write.
      await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
        prisma.knowledgeArticle.update({
          where: { id: articleId },
          data: {
            helpfulCount: { increment: deltas.helpfulCount },
            notHelpfulCount: { increment: deltas.notHelpfulCount },
          },
        }),
      );
    }
    return feedback;
  }

  async analytics(articleId: string): Promise<KnowledgeArticleAnalytics> {
    const article = await this.findOne(articleId);
    const total = article.helpfulCount + article.notHelpfulCount;
    return {
      articleId: article.id,
      viewCount: article.viewCount,
      helpfulCount: article.helpfulCount,
      notHelpfulCount: article.notHelpfulCount,
      helpfulRatio: total > 0 ? Math.round((article.helpfulCount / total) * 1000) / 1000 : null,
    };
  }

  /**
   * ILIKE over title + the current version's bodyMarkdown — deliberately
   * NOT pgvector semantic search. A separate agent is extending the AI
   * Gateway module for that; this endpoint's shape (accepts q + caseId,
   * returns KnowledgeArticle[]) is stable enough to upgrade later without
   * a breaking change here. caseId is accepted now but unused beyond the
   * query surface — reserved for relevance ranking once that lands.
   */
  async suggest(q: string, _caseId: string | undefined): Promise<KnowledgeArticle[]> {
    return getPrismaClient().knowledgeArticle.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ title: { contains: q, mode: 'insensitive' } }, { currentVersion: { bodyMarkdown: { contains: q, mode: 'insensitive' } } }],
      },
      orderBy: { viewCount: 'desc' },
      take: 10,
    });
  }
}

function feedbackCounterDeltas(
  previousVote: KnowledgeFeedbackVote | undefined,
  newVote: KnowledgeFeedbackVote,
): { helpfulCount: number; notHelpfulCount: number } {
  if (previousVote === newVote) return { helpfulCount: 0, notHelpfulCount: 0 };
  const delta = { helpfulCount: 0, notHelpfulCount: 0 };
  if (previousVote === 'HELPFUL') delta.helpfulCount -= 1;
  if (previousVote === 'NOT_HELPFUL') delta.notHelpfulCount -= 1;
  if (newVote === 'HELPFUL') delta.helpfulCount += 1;
  if (newVote === 'NOT_HELPFUL') delta.notHelpfulCount += 1;
  return delta;
}
