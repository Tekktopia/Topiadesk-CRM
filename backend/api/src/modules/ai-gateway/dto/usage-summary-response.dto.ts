import { ApiProperty } from '@nestjs/swagger';

export class UsageSummaryFeatureDto {
  @ApiProperty() feature!: string;
  @ApiProperty() requestCount!: number;
  @ApiProperty() tokensIn!: number;
  @ApiProperty() tokensOut!: number;
  @ApiProperty() costUsd!: number;
}

export class UsageSummaryResponseDto {
  @ApiProperty({ description: 'UTC calendar month this summary covers, YYYY-MM' }) month!: string;
  @ApiProperty({ type: [UsageSummaryFeatureDto] }) byFeature!: UsageSummaryFeatureDto[];
  @ApiProperty() totalCostUsd!: number;
  @ApiProperty() orgMonthlySpendCapUsd!: number;
}
