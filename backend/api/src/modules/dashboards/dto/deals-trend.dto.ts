import { ApiProperty } from '@nestjs/swagger';

export class DealsTrendMonthDto {
  @ApiProperty({ description: 'e.g. "2026-01"' }) month!: string;
  @ApiProperty({ description: 'Opportunities won (actualCloseDate falling in this month)' }) wonCount!: number;
  @ApiProperty({ description: 'sum(amount) for wonCount, decimal serialized as string' }) wonAmount!: string;
}

export class DealsProjectionMonthDto {
  @ApiProperty({ description: 'e.g. "2026-01"' }) month!: string;
  @ApiProperty({ description: 'Open opportunities expected to close in this month' }) count!: number;
  @ApiProperty({ description: 'sum(amount * probability/100), decimal serialized as string' }) weightedAmount!: string;
  @ApiProperty({ description: 'sum(amount), decimal serialized as string' }) unweightedAmount!: string;
}

export class DealsTrendResponseDto {
  @ApiProperty({ type: [DealsTrendMonthDto], description: 'Trailing 12 months, oldest first, ending this month' }) trailing!: DealsTrendMonthDto[];
  @ApiProperty({ type: [DealsProjectionMonthDto], description: 'Forward 12 months, starting this month' }) forward!: DealsProjectionMonthDto[];
}
