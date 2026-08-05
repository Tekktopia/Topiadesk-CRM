import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, NotEquals } from 'class-validator';

export class EarnPointsDto {
  @ApiProperty({ description: 'Always positive — validated server-side' }) @IsInt() @NotEquals(0) points!: number;
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
  @ApiPropertyOptional({ description: 'The bind/renewal that earned these points' }) @IsOptional() @IsUUID() relatedPolicyId?: string;
}

export class RedeemPointsDto {
  @ApiProperty({ description: 'A positive number — the amount to redeem; posted as a negative ledger entry' })
  @IsInt()
  @NotEquals(0)
  points!: number;
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
}

export class AdjustPointsDto {
  @ApiProperty({ description: 'Signed — positive to grant, negative to claw back' }) @IsInt() @NotEquals(0) points!: number;
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
}

export class LoyaltyTransactionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() loyaltyAccountId!: string;
  @ApiProperty() type!: string;
  @ApiProperty() points!: number;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({ nullable: true }) relatedPolicyId!: string | null;
  @ApiPropertyOptional({ nullable: true }) createdById!: string | null;
  @ApiPropertyOptional({ nullable: true }) createdByName?: string | null;
  @ApiProperty() createdAt!: Date;
}
