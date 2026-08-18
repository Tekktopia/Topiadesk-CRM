import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

/**
 * The list is raw SQL against a LATERAL SUM, so it can't lean on Prisma's
 * default paging. 200 was previously hardcoded; it stays the default so
 * existing callers are unaffected, and 1000 is the hard ceiling — enough for
 * a full CSV export of a realistic programme without letting a crafted
 * `take` scan an unbounded ledger join.
 */
export const LOYALTY_DEFAULT_TAKE = 200;
export const LOYALTY_MAX_TAKE = 1000;

export class LoyaltyAccountQueryDto {
  @ApiPropertyOptional({ description: 'Matches the enrolled account name (case-insensitive, substring).' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Exact tier match. Free text, not an enum — tenants define their own tiers.' })
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiPropertyOptional({ default: LOYALTY_DEFAULT_TAKE, maximum: LOYALTY_MAX_TAKE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LOYALTY_MAX_TAKE)
  take?: number;
}

export class EnrollLoyaltyAccountDto {
  @ApiProperty() @IsUUID() accountId!: string;
  @ApiPropertyOptional({ description: 'Defaults to STANDARD' }) @IsOptional() @IsString() @MinLength(1) tier?: string;
}

export class UpdateLoyaltyTierDto {
  @ApiProperty() @IsString() @MinLength(1) tier!: string;
}

export class LoyaltyAccountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiPropertyOptional() accountName?: string;
  @ApiProperty() tier!: string;
  @ApiProperty({ description: 'SUM(points) over every posted transaction — see the schema comment on why this is never a stored column' })
  pointsBalance!: number;
  @ApiProperty() enrolledAt!: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/**
 * Loyalty-programme aggregates.
 *
 * `pointsOutstanding` is a LIABILITY, not a score: every unredeemed point is
 * something the business still owes a customer. It is SUM(points) across
 * every transaction (earns positive, redemptions negative), matching how
 * pointsBalance is derived per account — deliberately never a stored column,
 * see the LoyaltyAccount schema comment.
 *
 * `tierBreakdown` is returned as a list rather than fixed fields because
 * tier is a free-text column (default "STANDARD"), not an enum — a tenant
 * can invent its own tiers and the header must still describe them.
 */
export class LoyaltyTierCountDto {
  @ApiProperty() tier!: string;
  @ApiProperty() members!: number;
}

export class LoyaltyStatsResponseDto {
  @ApiProperty({ description: 'Accounts enrolled in the programme.' }) members!: number;
  @ApiProperty({ description: 'Members enrolled in the last 30 days.' }) enrolledLast30Days!: number;
  @ApiProperty({ description: 'Net unredeemed points across the programme — an outstanding liability.' })
  pointsOutstanding!: number;
  @ApiProperty({ type: [LoyaltyTierCountDto] }) tierBreakdown!: LoyaltyTierCountDto[];
}
