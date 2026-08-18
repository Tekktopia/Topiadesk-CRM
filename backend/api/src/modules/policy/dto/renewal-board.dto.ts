import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBooleanString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { RenewalStatus } from '@topiadesk/db';

/**
 * Policy statuses that are still renewable. A CANCELLED, LAPSED or already
 * RENEWED policy is not a retention opportunity, so it never appears on the
 * board — leaving them in would inflate every count and make "value at risk"
 * meaningless.
 */
export const RENEWABLE_POLICY_STATUSES = ['QUOTED', 'BOUND', 'ISSUED', 'ENDORSED'] as const;

/** The windows the board buckets by, in days. */
export const RENEWAL_WINDOWS = [30, 60, 90] as const;
export const DEFAULT_RENEWAL_WINDOW_DAYS = 90;

export class RenewalBoardQueryDto {
  @ApiPropertyOptional({
    description: 'Only policies expiring within this many days from today. Past-due policies are always included — see the controller.',
    default: DEFAULT_RENEWAL_WINDOW_DAYS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  withinDays?: number;

  @ApiPropertyOptional({ enum: RenewalStatus })
  @IsOptional()
  @IsEnum(RenewalStatus)
  renewalStatus?: RenewalStatus;

  @ApiPropertyOptional({ description: 'Renewal owner (RenewalSchedule.assignedToId).' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Broker of record on the policy.' })
  @IsOptional()
  @IsUUID()
  brokerOfRecordId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() carrierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lineOfBusiness?: string;

  @ApiPropertyOptional({ description: 'Substring match on policy number (case-insensitive).' })
  @IsOptional()
  @IsString()
  q?: string;

  /**
   * String, not boolean — the global pipe's enableImplicitConversion casts a
   * boolean-typed query param with Boolean(), so "false" would arrive as
   * `true`. See AccountQueryDto.includeArchived for the full explanation.
   */
  @ApiPropertyOptional({ description: "'true' to show only renewals with no owner assigned." })
  @IsOptional()
  @IsBooleanString()
  unassignedOnly?: string;

  @ApiPropertyOptional({ enum: ['expiryDate', 'premium'], default: 'expiryDate' })
  @IsOptional()
  @IsIn(['expiryDate', 'premium'])
  sortBy?: 'expiryDate' | 'premium';

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  take?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class RenewalBoardRowDto {
  @ApiProperty() policyId!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() carrierName!: string;
  @ApiProperty() lineOfBusiness!: string;
  @ApiProperty() expiryDate!: Date;
  /** Negative once the policy has already expired — the board sorts these to the top. */
  @ApiProperty({ description: 'Whole days from today until expiry; negative if already past.' })
  daysToExpiry!: number;
  @ApiProperty({ enum: RenewalStatus, nullable: true }) renewalStatus!: RenewalStatus | null;
  @ApiProperty({ nullable: true }) renewalDueDate!: Date | null;
  @ApiProperty({ nullable: true }) assignedToId!: string | null;
  @ApiProperty({ nullable: true }) assignedToName!: string | null;
  @ApiProperty({ nullable: true }) brokerOfRecordName!: string | null;
  @ApiProperty({ description: 'Gross premium of the expiring term, converted to the base currency.' })
  annualPremiumBase!: number;
  @ApiProperty() baseCurrency!: string;
  @ApiProperty({ description: 'True when no RenewalSchedule row exists yet — the policy is expiring with no renewal process started at all.' })
  scheduleMissing!: boolean;
}

/**
 * Board-level aggregates.
 *
 * `valueAtRisk` is the number a broking principal actually asks for: gross
 * premium, in base currency, across every renewable policy in the current
 * filter. `overdue` counts policies already past expiry that were never
 * renewed — the most urgent bucket, and the one a "next 90 days" filter
 * would otherwise hide entirely.
 */
export class RenewalBoardStatsDto {
  @ApiProperty({ description: 'Renewable policies matching the current filter.' }) total!: number;
  @ApiProperty({ description: 'Already past expiry and not renewed.' }) overdue!: number;
  @ApiProperty() dueIn30!: number;
  @ApiProperty() dueIn60!: number;
  @ApiProperty() dueIn90!: number;
  @ApiProperty({ description: 'No renewal owner assigned.' }) unassigned!: number;
  @ApiProperty({ description: 'RenewalSchedule.status = AT_RISK.' }) atRisk!: number;
  @ApiProperty({ description: 'Expiring with no RenewalSchedule row at all.' }) noScheduleStarted!: number;
  @ApiProperty({ description: 'Gross premium across the filtered set, in base currency.' }) valueAtRisk!: number;
  @ApiProperty() baseCurrency!: string;
}
