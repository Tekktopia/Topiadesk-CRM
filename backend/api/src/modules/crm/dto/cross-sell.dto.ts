import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AccountStatus } from '@topiadesk/db';

/**
 * Policy statuses that count as "the client currently holds this cover".
 * A quoted-but-never-bound policy is not a holding — treating it as one
 * would hide a real cross-sell opportunity behind a deal that never closed.
 */
export const HELD_POLICY_STATUSES = ['BOUND', 'ISSUED', 'ENDORSED', 'RENEWED'] as const;

export class CrossSellQueryDto {
  @ApiPropertyOptional({ description: 'Only accounts that do NOT hold this line — the core "who can I sell this to" filter.' })
  @IsOptional()
  @IsString()
  missingLine?: string;

  @ApiPropertyOptional({ description: 'Only accounts that already hold this line.' })
  @IsOptional()
  @IsString()
  holdsLine?: string;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional() @IsOptional() @IsUUID() ownerId?: string;

  @ApiPropertyOptional({ description: 'Only accounts holding at least this many distinct lines.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minLinesHeld?: number;

  @ApiPropertyOptional({ default: 200, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  take?: number;
}

export class CrossSellRowDto {
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty({ enum: AccountStatus }) status!: string;
  @ApiProperty({ nullable: true }) ownerName!: string | null;
  @ApiProperty({ type: [String], description: 'Distinct lines of business this client currently holds.' })
  linesHeld!: string[];
  @ApiProperty({ type: [String], description: 'Lines the firm can place that this client does NOT hold — the whitespace.' })
  linesMissing!: string[];
  @ApiProperty() policyCount!: number;
  @ApiProperty({ description: 'Gross premium across held policies, in base currency.' })
  premiumBase!: number;
  @ApiProperty() baseCurrency!: string;
}

export class CrossSellLineDto {
  @ApiProperty() line!: string;
  @ApiProperty({ description: 'Accounts in this view already holding it.' }) accountsHolding!: number;
  @ApiProperty({ description: 'Accounts in this view that do not — the addressable gap.' }) accountsMissing!: number;
}

/**
 * Whitespace aggregates.
 *
 * `biggestGapLine` is the headline: the single line of business the most
 * existing clients don't yet hold. For a brokerage that is the clearest
 * revenue lever in the CRM, and nothing in the system surfaced it before.
 */
export class CrossSellStatsDto {
  @ApiProperty({ description: 'Accounts analysed under the current filter.' }) accounts!: number;
  @ApiProperty({ description: 'Accounts holding at least one policy.' }) accountsWithCover!: number;
  @ApiProperty({ description: 'Accounts missing at least one line the firm can place.' }) accountsWithGaps!: number;
  @ApiProperty({ description: 'Distinct lines the firm can place (carrier panel plus anything already written).' })
  linesAvailable!: number;
  @ApiProperty({ description: 'Mean distinct lines held per account with cover, to one decimal.' })
  averageLinesPerAccount!: number;
  @ApiProperty({ nullable: true, description: 'The line the most accounts are missing.' })
  biggestGapLine!: string | null;
  @ApiProperty({ description: 'How many accounts are missing that line.' }) biggestGapCount!: number;
  @ApiProperty({ type: [CrossSellLineDto] }) lines!: CrossSellLineDto[];
}
