import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: AiGatewayService is constructor-injected below —
// see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AiGatewayService } from './ai-gateway.service';
// NOT a type-only import: SummarizeRequestDto is used as a @Body() parameter
// type, and NestJS's ValidationPipe/class-validator need the real class
// reference at runtime (via emitDecoratorMetadata's design:paramtypes) to
// validate against — `import type` erases the class entirely, silently
// disabling validation for this endpoint. This is a real footgun with the
// `consistent-type-imports` ESLint rule's --fix; watch for it in every DTO
// used as a decorated controller-method parameter.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above: ESLint can't see NestJS's runtime need for this value import
import { SummarizeRequestDto, type SummarizeResponseDto } from './dto/summarize-request.dto';
// Same value-import requirement as SummarizeRequestDto above.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { ReplyDraftRequestDto, type ReplyDraftResponseDto } from './dto/reply-draft-request.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { SentimentRequestDto, type SentimentResponseDto } from './dto/sentiment-request.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { CategorizeRequestDto, type CategorizeResponseDto } from './dto/categorize-request.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { AccountInsightRequestDto, type AccountInsightResponseDto } from './dto/account-insight-request.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { SemanticIndexRequestDto, type SemanticIndexResponseDto } from './dto/semantic-index-request.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { SemanticSearchRequestDto, type SemanticSearchResponseDto } from './dto/semantic-search-request.dto';
import type { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';

/**
 * Batch 1 Agent D — backend/api/src/modules/ai-gateway/: Anthropic SDK
 * wrapper, AiUsageLedger cost-cap enforcement (org monthly spend cap +
 * per-user daily request cap — see ai-gateway.service.ts for the actual
 * check). 'ai_usage'/'write' is currently only granted to ADMIN in
 * seed.ts (see this module's final report) — flagged rather than fixed
 * here since seed.ts is shared with parallel agents.
 *
 * Phase 2 extension (sentiment/categorize/account-insight/index/search/
 * usage-summary): every new AI call is advisory-only and routes through
 * the SAME cost-cap gate as summarize/reply-draft above — see
 * ai-gateway.service.ts's class-level comment for the full reasoning.
 * Semantic search's write path surfaced a real RLS grant gap
 * ('semantic_embedding' isn't a seeded permission resource at all) — see
 * ai-gateway.service.ts's upsertEmbeddingChunk() comment; flagged rather
 * than fixed in seed.ts for the same reason as the 'ai_usage' gap above.
 */
@ApiTags('ai-gateway')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('ai')
export class AiGatewayController {
  constructor(private readonly aiGateway: AiGatewayService) {}

  @Post('summarize')
  @RequirePermission('ai_usage', 'write')
  async summarize(@Body() dto: SummarizeRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<SummarizeResponseDto> {
    return this.aiGateway.summarize(dto, user);
  }

  @Post('reply-draft')
  @RequirePermission('ai_usage', 'write')
  async replyDraft(@Body() dto: ReplyDraftRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<ReplyDraftResponseDto> {
    return this.aiGateway.replyDraft(dto, user);
  }

  @Post('sentiment')
  @RequirePermission('ai_usage', 'write')
  async sentiment(@Body() dto: SentimentRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<SentimentResponseDto> {
    return this.aiGateway.sentiment(dto, user);
  }

  @Post('categorize')
  @RequirePermission('ai_usage', 'write')
  async categorize(@Body() dto: CategorizeRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<CategorizeResponseDto> {
    return this.aiGateway.categorize(dto, user);
  }

  @Post('account-insight')
  @RequirePermission('ai_usage', 'write')
  async accountInsight(@Body() dto: AccountInsightRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<AccountInsightResponseDto> {
    return this.aiGateway.accountInsight(dto, user);
  }

  @Post('index')
  @RequirePermission('ai_usage', 'write')
  async index(@Body() dto: SemanticIndexRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<SemanticIndexResponseDto> {
    return this.aiGateway.index(dto, user);
  }

  @Post('search')
  @RequirePermission('ai_usage', 'write')
  async search(@Body() dto: SemanticSearchRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<SemanticSearchResponseDto> {
    return this.aiGateway.search(dto, user);
  }

  @Get('usage-summary')
  @RequirePermission('ai_usage', 'read')
  async usageSummary(): Promise<UsageSummaryResponseDto> {
    return this.aiGateway.usageSummary();
  }
}
