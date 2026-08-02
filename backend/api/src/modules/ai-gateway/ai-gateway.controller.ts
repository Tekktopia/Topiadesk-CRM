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
// Same value-import requirement as SummarizeRequestDto above.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above SummarizeRequestDto's import
import { ReplyDraftRequestDto, type ReplyDraftResponseDto } from './dto/reply-draft-request.dto';

/**
 * Batch 1 Agent D — backend/api/src/modules/ai-gateway/: Anthropic SDK
 * wrapper, AiUsageLedger cost-cap enforcement (org monthly spend cap +
 * per-user daily request cap — see ai-gateway.service.ts for the actual
 * check). 'ai_usage'/'write' is currently only granted to ADMIN in
 * seed.ts (see this module's final report) — flagged rather than fixed
 * here since seed.ts is shared with parallel agents.
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
}
