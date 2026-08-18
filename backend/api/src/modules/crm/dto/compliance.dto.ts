import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Aggregated counts for the /compliance dashboard — deliberately just
 * counts, not full row data (each links out to the existing detail page
 * that already owns that data: Data Subject Requests, Consent Records via
 * account pages, KYC below, Audit Log). `latestCheckpointAt` reports the
 * most recent AuditCheckpoint without re-running verification — that
 * already happens automatically every ~5 min in backend/worker's
 * audit-checkpoint/create-checkpoint.job.ts, which alerts on its own if a
 * mismatch is ever found; re-verifying on every dashboard page load would
 * just be redundant, expensive work for the same answer.
 */
export class ComplianceSummaryResponseDto {
  @ApiProperty() openDsrCount!: number;
  @ApiProperty() kycExpiringCount!: number;
  @ApiProperty() kycAttentionCount!: number;
  @ApiProperty() consentRecordsThisWeek!: number;
  @ApiProperty({ nullable: true }) latestCheckpointAt!: Date | null;
}

export class KycDashboardQueryDto {
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export type KycUrgency = 'EXPIRED' | 'EXPIRING_SOON' | 'NOT_VERIFIED';

export class KycAccountRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() kycStatus!: string;
  @ApiProperty({ nullable: true }) kycExpiryDate!: Date | null;
  @ApiProperty({ enum: ['EXPIRED', 'EXPIRING_SOON', 'NOT_VERIFIED'] }) urgency!: KycUrgency;
}
