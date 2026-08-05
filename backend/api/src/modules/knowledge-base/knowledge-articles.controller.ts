import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT a type-only import: KnowledgeArticlesService is constructor-injected
// below — Nest's DI resolves constructor parameter types via
// emitDecoratorMetadata's design:paramtypes, which needs the real class
// reference at runtime (same footgun documented on Reflector in
// permission.guard.ts and DocumentsService's import in documents.controller.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KnowledgeArticlesService } from './knowledge-articles.service';
// NOT type-only: CreateKnowledgeArticleDto/KnowledgeArticleQueryDto are
// @Body()/@Query() parameter types (see the eslint.config.mjs root-level
// CAUTION comment on this exact footgun — a bare `import { ... }` here
// with no disable would get silently split into a type-only import for
// these two specifiers by `eslint --fix`, breaking ValidationPipe).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateKnowledgeArticleDto, KnowledgeArticleQueryDto, KnowledgeArticleResponseDto } from './dto/knowledge-article.dto';
// NOT type-only imports: both DTO classes are used as @Body() parameter
// types below — NestJS's ValidationPipe needs the real class reference at
// runtime (see documents.controller.ts's comment on this same footgun).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateKnowledgeArticleVersionDto, KnowledgeArticleVersionResponseDto } from './dto/knowledge-article-version.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  KnowledgeArticleAnalyticsResponseDto,
  KnowledgeArticleFeedbackResponseDto,
  UpsertKnowledgeArticleFeedbackDto,
} from './dto/knowledge-article-feedback.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DecideKnowledgeApprovalDto } from './dto/decide-knowledge-approval.dto';

/**
 * Read endpoints carry no @RequirePermission — matches
 * `knowledge_articles_select`'s USING clause (PUBLISHED visible to any
 * authenticated user; DRAFT/IN_REVIEW/ARCHIVED only to the owner or an
 * ALL-scope editor, enforced by RLS regardless of what this guard does).
 * Write endpoints require 'knowledge_article'/'write', matching
 * `knowledge_articles_write`'s WITH CHECK. `/decision` is the one
 * exception, gated on 'approval'/'write' like PolicyVersionController's
 * own `.../decision` endpoint — segregation of duties is an approvals
 * concern, not a content-ownership one. `/feedback` also carries no
 * @RequirePermission — `knowledge_article_feedback_rw`'s WITH CHECK is
 * `user_id = app_current_user_id()` only, i.e. any authenticated user may
 * record their own vote.
 */
@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('knowledge/articles')
export class KnowledgeArticlesController {
  constructor(private readonly articles: KnowledgeArticlesService) {}

  // Registered before ':id' deliberately — Nest/Express route matching is
  // declaration-order-sensitive for overlapping patterns (same reasoning
  // as PremiumController's 'aging' vs ':id', premium.controller.ts).
  @Get('suggest')
  @ApiOkResponse({ type: [KnowledgeArticleResponseDto] })
  async suggest(@Query('q') q: string, @Query('caseId') caseId?: string): Promise<KnowledgeArticleResponseDto[]> {
    if (!q?.trim()) return [];
    return this.articles.suggest(q, caseId);
  }

  @Get()
  @ApiOkResponse({ type: [KnowledgeArticleResponseDto] })
  async list(@Query() query: KnowledgeArticleQueryDto): Promise<KnowledgeArticleResponseDto[]> {
    return this.articles.list(query);
  }

  @Post()
  @RequirePermission('knowledge_article', 'write')
  @ApiOkResponse({ type: KnowledgeArticleResponseDto })
  async create(@Body() dto: CreateKnowledgeArticleDto, @CurrentUser() user: AuthenticatedUser): Promise<KnowledgeArticleResponseDto> {
    return this.articles.create(dto, user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: KnowledgeArticleResponseDto })
  async findOne(@Param('id') id: string): Promise<KnowledgeArticleResponseDto> {
    const article = await this.articles.findOne(id);
    this.articles.recordView(id); // fire-and-forget — see service method's comment
    return article;
  }

  @Get(':id/versions')
  @ApiOkResponse({ type: [KnowledgeArticleVersionResponseDto] })
  async listVersions(@Param('id') id: string): Promise<KnowledgeArticleVersionResponseDto[]> {
    return this.articles.listVersions(id);
  }

  @Post(':id/versions')
  @RequirePermission('knowledge_article', 'write')
  @ApiOkResponse({ type: KnowledgeArticleResponseDto })
  async addVersion(
    @Param('id') id: string,
    @Body() dto: CreateKnowledgeArticleVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    return this.articles.addVersion(id, dto, user.id);
  }

  @Post(':id/submit-for-review')
  @RequirePermission('knowledge_article', 'write')
  @ApiOkResponse({ type: KnowledgeArticleResponseDto })
  async submitForReview(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<KnowledgeArticleResponseDto> {
    return this.articles.submitForReview(id, user.id);
  }

  /**
   * The Approval decision endpoint — APPROVED publishes the article,
   * REJECTED returns it to DRAFT. See KnowledgeArticlesService.decideApproval()
   * for why this is the actual handler invoked on the approval decision
   * (no separate "POST .../publish" route bypassing the gate).
   */
  @Post(':id/decision')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: KnowledgeArticleResponseDto })
  async decideApproval(
    @Param('id') id: string,
    @Body() dto: DecideKnowledgeApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    return this.articles.decideApproval(id, dto.decision, dto.reason, user.id);
  }

  @Post(':id/archive')
  @RequirePermission('knowledge_article', 'write')
  @ApiOkResponse({ type: KnowledgeArticleResponseDto })
  async archive(@Param('id') id: string): Promise<KnowledgeArticleResponseDto> {
    return this.articles.archive(id);
  }

  @Post(':id/feedback')
  @ApiOkResponse({ type: KnowledgeArticleFeedbackResponseDto })
  async feedback(
    @Param('id') id: string,
    @Body() dto: UpsertKnowledgeArticleFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleFeedbackResponseDto> {
    return this.articles.upsertFeedback(id, user.id, dto);
  }

  @Get(':id/analytics')
  @ApiOkResponse({ type: KnowledgeArticleAnalyticsResponseDto })
  async analytics(@Param('id') id: string): Promise<KnowledgeArticleAnalyticsResponseDto> {
    return this.articles.analytics(id);
  }
}
