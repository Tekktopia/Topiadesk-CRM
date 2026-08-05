import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

/** period is a 'YYYY-MM' month bucket, matching agent_survey_summary's period_month grain (date_trunc('month', ...)). */
export class SurveyCsatReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() agentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional({ example: '2026-07' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/) period?: string;
}

export class SurveyNpsReportQueryDto {
  @ApiPropertyOptional({ example: '2026-07' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/) period?: string;
}

/** One row of agent_survey_summary_scoped — see prisma/rls/004_reporting_views.sql. */
export class AgentSurveySummaryRowDto {
  @ApiProperty() agentId!: string;
  @ApiProperty({ enum: ['CSAT', 'NPS', 'CES'] }) surveyType!: string;
  @ApiProperty() periodMonth!: string;
  @ApiProperty() responseCount!: number;
  @ApiPropertyOptional({ nullable: true, description: '% of CSAT responses scoring in the top band (scaleMax or scaleMax-1)' })
  csatPct!: number | null;
  @ApiPropertyOptional({ nullable: true, description: '%Promoters (9-10) minus %Detractors (0-6)' })
  npsScore!: number | null;
}
