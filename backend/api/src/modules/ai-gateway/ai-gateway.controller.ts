import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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

/**
 * Fully local AI assistant endpoints — see ai-gateway.service.ts's class
 * comment for the local-engine architecture (no external API calls, no
 * per-request cost). `reply-draft` and `usage-summary` were dropped in the
 * move to a local engine: reply-draft had zero frontend consumers and is
 * the one feature a non-generative local system genuinely can't do well
 * (deliberately descoped rather than shipped as a poor template-only
 * imitation); usage-summary tracked dollar spend that no longer exists and
 * also had zero frontend consumers.
 *
 * 'ai_usage'/'write' permission scoping (DEPARTMENT/OWN/ALL, see
 * seed.ts) is unchanged from before — still the same gate on every route.
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
}
