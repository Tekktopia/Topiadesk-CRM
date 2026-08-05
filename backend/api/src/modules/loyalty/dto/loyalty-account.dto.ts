import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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
