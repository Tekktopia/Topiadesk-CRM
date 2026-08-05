import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AccountInsightRequestDto {
  @ApiProperty() @IsUUID() accountId!: string;
}

/** Advisory renewal-meeting-prep brief — INSIGHT's first real consumer (see AiFeature enum). Never written back to the Account record. */
export class AccountInsightResponseDto {
  @ApiProperty({ description: 'Renewal-meeting-prep narrative covering policies, premiums, upcoming renewals, and recent activity' })
  narrative!: string;
  @ApiProperty({ type: [String] }) riskFlags!: string[];
  @ApiProperty() estimatedCostUsd!: number;
}
