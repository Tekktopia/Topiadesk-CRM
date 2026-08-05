import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
// NOT a type-only import: SurveysService is constructor-injected below —
// same DI footgun documented in surveys.controller.ts's import of it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SurveysService } from './surveys.service';
// NOT type-only: SubmitSurveyResponseDto is a @Body() parameter type — see
// eslint.config.mjs's root-level CAUTION comment.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SubmitSurveyResponseDto } from './dto/survey-response.dto';

/**
 * The one unauthenticated route in this module — the respondent is
 * typically an external Contact clicking an emailed/SMS'd survey link,
 * not a logged-in User, so there is no bearer token to present.
 *
 * This route (POST surveys/responses/:id/submit) MUST be added to
 * app.module.ts's RlsContextMiddleware `.exclude(...)` list, the same way
 * `identity/webhooks/keycloak` already is — see that controller's header
 * comment for the full reasoning (no bound RLS context otherwise means no
 * app.current_user_id/app.current_role, and the audit trigger on
 * survey_responses would then violate audit_log's own RLS INSERT policy).
 * This module cannot make that change itself (app.module.ts is the shared
 * spine, off-limits to Batch 1 agents) — flagged for the integration pass.
 *
 * Security here is NOT "no guard" — it's "auth by possession of
 * respondToken", verified inside SurveysService.submitResponse() with a
 * constant-time comparison, not a NestJS CanActivate guard (there's
 * nothing to check before the specific row is loaded — the token IS the
 * per-row credential, not a shared secret like KeycloakWebhookGuard's).
 */
@ApiTags('surveys')
@Controller('surveys/responses')
export class SurveyResponsesController {
  constructor(private readonly surveys: SurveysService) {}

  @Post(':id/submit')
  @ApiOkResponse({ description: 'Records the respondent score/comment; rejects an invalid token or an already-answered response.' })
  async submit(@Param('id') id: string, @Body() dto: SubmitSurveyResponseDto): Promise<{ status: 'recorded' }> {
    await this.surveys.submitResponse(id, dto.respondToken, dto.score, dto.comment);
    return { status: 'recorded' };
  }
}
