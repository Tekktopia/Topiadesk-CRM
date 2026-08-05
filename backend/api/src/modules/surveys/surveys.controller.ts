import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT a type-only import: SurveysService is constructor-injected below —
// Nest's DI resolves constructor parameter types via emitDecoratorMetadata's
// design:paramtypes, which needs the real class reference at runtime (same
// footgun documented on Reflector in permission.guard.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SurveysService } from './surveys.service';
// NOT type-only: CreateSurveyDto/SurveyQueryDto/UpdateSurveyDto are
// @Body()/@Query() parameter types (see eslint.config.mjs's root-level
// CAUTION comment — `eslint --fix` would happily split this into a
// type-only import for the type-position-only specifiers, breaking
// ValidationPipe for them).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateSurveyDto, SurveyDto, SurveyQueryDto, UpdateSurveyDto } from './dto/survey.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SurveyResponseQueryDto, SurveyResponseRecordDto } from './dto/survey-response.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AgentSurveySummaryRowDto, SurveyCsatReportQueryDto, SurveyNpsReportQueryDto } from './dto/survey-report.dto';
import { queryRawWithRlsContext } from './rls-raw-query.util';

interface RawAgentSurveySummaryRow {
  agent_id: string;
  survey_type: string;
  period_month: Date;
  response_count: bigint;
  csat_pct: string | null;
  nps_score: string | null;
}

function toSummaryDto(row: RawAgentSurveySummaryRow): AgentSurveySummaryRowDto {
  return {
    agentId: row.agent_id,
    surveyType: row.survey_type,
    periodMonth: row.period_month.toISOString().slice(0, 10),
    responseCount: Number(row.response_count),
    csatPct: row.csat_pct !== null ? Number(row.csat_pct) : null,
    npsScore: row.nps_score !== null ? Number(row.nps_score) : null,
  };
}

/**
 * Survey (the definition, e.g. "Post-resolution CSAT") is ALL-scope-only
 * per `surveys_rw`'s WITH CHECK — there is no OWN/DEPARTMENT/BRANCH tier
 * for creating or editing a survey definition, unlike most resources in
 * this codebase. `@RequirePermission('survey', ...)` on every route below
 * (including reads) mirrors that restriction as a clean 403 rather than a
 * silently empty list.
 */
@ApiTags('surveys')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get()
  @RequirePermission('survey', 'read')
  @ApiOkResponse({ type: [SurveyDto] })
  async list(@Query() query: SurveyQueryDto): Promise<SurveyDto[]> {
    return this.surveys.list(query);
  }

  @Post()
  @RequirePermission('survey', 'write')
  @ApiOkResponse({ type: SurveyDto })
  async create(@Body() dto: CreateSurveyDto, @CurrentUser() user: AuthenticatedUser): Promise<SurveyDto> {
    return this.surveys.create(dto, user.id);
  }

  // Registered before ':id' deliberately — Nest/Express route matching is
  // declaration-order-sensitive for overlapping patterns (same reasoning
  // as PremiumController's 'aging' vs ':id', premium.controller.ts).
  @Get('reports/csat')
  @RequirePermission('survey_response', 'read')
  @ApiOkResponse({ type: [AgentSurveySummaryRowDto] })
  async csatReport(@Query() query: SurveyCsatReportQueryDto): Promise<AgentSurveySummaryRowDto[]> {
    const agentIdFilter = query.agentId ?? null;
    const teamIdFilter = query.teamId ?? null;
    const periodFilter = query.period ? `${query.period}-01` : null;
    const rows = await queryRawWithRlsContext<RawAgentSurveySummaryRow[]>`
      SELECT agent_id, survey_type, period_month, response_count, csat_pct, nps_score
      FROM agent_survey_summary_scoped ass
      WHERE ass.survey_type = 'CSAT'
        AND (${agentIdFilter}::uuid IS NULL OR ass.agent_id = ${agentIdFilter}::uuid)
        AND (${teamIdFilter}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM team_members tm WHERE tm.team_id = ${teamIdFilter}::uuid AND tm.user_id = ass.agent_id
        ))
        AND (${periodFilter}::date IS NULL OR ass.period_month = ${periodFilter}::date)
      ORDER BY ass.period_month DESC
      LIMIT 500
    `;
    return rows.map(toSummaryDto);
  }

  @Get('reports/nps')
  @RequirePermission('survey_response', 'read')
  @ApiOkResponse({ type: [AgentSurveySummaryRowDto] })
  async npsReport(@Query() query: SurveyNpsReportQueryDto): Promise<AgentSurveySummaryRowDto[]> {
    const periodFilter = query.period ? `${query.period}-01` : null;
    const rows = await queryRawWithRlsContext<RawAgentSurveySummaryRow[]>`
      SELECT agent_id, survey_type, period_month, response_count, csat_pct, nps_score
      FROM agent_survey_summary_scoped ass
      WHERE ass.survey_type = 'NPS'
        AND (${periodFilter}::date IS NULL OR ass.period_month = ${periodFilter}::date)
      ORDER BY ass.period_month DESC
      LIMIT 500
    `;
    return rows.map(toSummaryDto);
  }

  @Get(':id')
  @RequirePermission('survey', 'read')
  @ApiOkResponse({ type: SurveyDto })
  async findOne(@Param('id') id: string): Promise<SurveyDto> {
    return this.surveys.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('survey', 'write')
  @ApiOkResponse({ type: SurveyDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSurveyDto): Promise<SurveyDto> {
    return this.surveys.update(id, dto);
  }

  @Get(':id/responses')
  @RequirePermission('survey_response', 'read')
  @ApiOkResponse({ type: [SurveyResponseRecordDto] })
  async responses(@Param('id') id: string, @Query() query: SurveyResponseQueryDto): Promise<SurveyResponseRecordDto[]> {
    const responses = await this.surveys.listResponses(id, {
      agentId: query.agentId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    // respondToken deliberately dropped here — see SurveyResponseRecordDto's
    // header comment; this is the credential the public submit endpoint
    // checks, not display data.
    return responses.map(({ respondToken: _respondToken, ...rest }) => rest);
  }
}
