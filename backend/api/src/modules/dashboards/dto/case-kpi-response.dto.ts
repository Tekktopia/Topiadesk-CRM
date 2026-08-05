import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CaseKpiQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class CaseStatusCountDto {
  @ApiProperty() status!: string;
  @ApiProperty() count!: number;
}

export class CaseVolumeTrendPointDto {
  @ApiProperty() date!: string;
  @ApiProperty() count!: number;
}

export class AgentWorkloadDto {
  @ApiProperty() userId!: string;
  @ApiProperty() userName!: string;
  @ApiProperty() openCaseCount!: number;
}

export class CaseKpiResponseDto {
  @ApiProperty() days!: number;
  @ApiPropertyOptional({ nullable: true }) avgFirstResponseHours!: number | null;
  @ApiPropertyOptional({ nullable: true }) avgResolutionHours!: number | null;
  @ApiPropertyOptional({ nullable: true }) slaBreachRatePercent!: number | null;
  @ApiProperty({ type: [CaseStatusCountDto] }) openCaseCountByStatus!: CaseStatusCountDto[];
  @ApiProperty({ type: [CaseVolumeTrendPointDto] }) caseVolumeTrend!: CaseVolumeTrendPointDto[];
  @ApiProperty({ type: [AgentWorkloadDto] }) agentWorkload!: AgentWorkloadDto[];
}
