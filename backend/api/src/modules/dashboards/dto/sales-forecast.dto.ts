import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class SalesForecastQueryDto {
  @ApiProperty({ enum: ['month', 'quarter'], required: false, default: 'quarter', description: 'The current month/quarter containing today' })
  @IsOptional()
  @IsIn(['month', 'quarter'])
  period?: 'month' | 'quarter';
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() pipelineId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ enum: ['owner', 'stage', 'lineOfBusiness'], required: false, default: 'owner' })
  @IsOptional()
  @IsIn(['owner', 'stage', 'lineOfBusiness'])
  groupBy?: 'owner' | 'stage' | 'lineOfBusiness';
}

export class SalesForecastGroupDto {
  @ApiProperty() key!: string;
  @ApiProperty({ nullable: true }) label!: string | null;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'sum(amount * probability/100), decimal serialized as string' }) weightedAmount!: string;
  @ApiProperty({ description: 'sum(amount), decimal serialized as string' }) unweightedAmount!: string;
}

export class SalesForecastResponseDto {
  @ApiProperty({ description: 'e.g. "2026-08" or "2026-Q3"' }) period!: string;
  @ApiProperty() periodStart!: string;
  @ApiProperty() periodEnd!: string;
  @ApiProperty({ type: [SalesForecastGroupDto] }) groups!: SalesForecastGroupDto[];
  @ApiProperty() totalWeightedAmount!: string;
  @ApiProperty() totalUnweightedAmount!: string;
}
