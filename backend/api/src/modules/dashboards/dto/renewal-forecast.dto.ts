import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class RenewalForecastQueryDto {
  @ApiProperty({ enum: ['month', 'quarter'], required: false, default: 'quarter', description: 'The current month/quarter containing today' })
  @IsOptional()
  @IsIn(['month', 'quarter'])
  period?: 'month' | 'quarter';
  @ApiProperty({ required: false, description: 'Filters to one RenewalSchedule.assignedToId' }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false, description: 'Filters to one line of business — independent of groupBy, which pivots the results instead of narrowing them' })
  @IsOptional()
  @IsString()
  lineOfBusiness?: string;
  @ApiProperty({ enum: ['status', 'owner', 'lineOfBusiness'], required: false, default: 'status' })
  @IsOptional()
  @IsIn(['status', 'owner', 'lineOfBusiness'])
  groupBy?: 'status' | 'owner' | 'lineOfBusiness';
}

export class RenewalForecastGroupDto {
  @ApiProperty() key!: string;
  @ApiProperty({ nullable: true }) label!: string | null;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'sum(grossPremium * statusWeight), decimal serialized as string — see RENEWAL_STATUS_WEIGHTS' }) weightedAmount!: string;
  @ApiProperty({ description: 'sum(grossPremium), decimal serialized as string' }) unweightedAmount!: string;
}

export class RenewalForecastResponseDto {
  @ApiProperty({ description: 'e.g. "2026-08" or "2026-Q3"' }) period!: string;
  @ApiProperty() periodStart!: string;
  @ApiProperty() periodEnd!: string;
  @ApiProperty({ type: [RenewalForecastGroupDto] }) groups!: RenewalForecastGroupDto[];
  @ApiProperty() totalWeightedAmount!: string;
  @ApiProperty() totalUnweightedAmount!: string;
  @ApiProperty({ description: 'Sum of unweightedAmount across only AT_RISK-weighted groups (see RENEWAL_STATUS_WEIGHTS) — the headline "premium at risk" figure.' })
  atRiskAmount!: string;
}
