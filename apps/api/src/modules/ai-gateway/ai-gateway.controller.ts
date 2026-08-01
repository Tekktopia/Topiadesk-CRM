import { Body, Controller, NotImplementedException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../../common/auth/permission.guard';
// NOT a type-only import: SummarizeRequestDto is used as a @Body() parameter
// type, and NestJS's ValidationPipe/class-validator need the real class
// reference at runtime (via emitDecoratorMetadata's design:paramtypes) to
// validate against — `import type` erases the class entirely, silently
// disabling validation for this endpoint. This is a real footgun with the
// `consistent-type-imports` ESLint rule's --fix; watch for it in every DTO
// used as a decorated controller-method parameter.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above: ESLint can't see NestJS's runtime need for this value import
import { SummarizeRequestDto, type SummarizeResponseDto } from './dto/summarize-request.dto';

/**
 * Foundation stub — the request/response contract is real and Swagger-
 * documented; the implementation deliberately returns 501 rather than a
 * fake response. Batch 1 Agent D owns apps/api/src/modules/ai-gateway/:
 * Anthropic SDK wrapper, AiUsageLedger cost-cap enforcement (per-org monthly
 * cap + per-user daily request cap, from AI_ORG_MONTHLY_SPEND_CAP_USD /
 * AI_PER_USER_DAILY_REQUEST_CAP), pgvector embedding writes.
 */
@ApiTags('ai-gateway')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('ai/summarize')
export class AiGatewayController {
  @Post()
  summarize(@Body() _dto: SummarizeRequestDto): SummarizeResponseDto {
    throw new NotImplementedException('AI Gateway summarization lands in Batch 1 (Agent D)');
  }
}
