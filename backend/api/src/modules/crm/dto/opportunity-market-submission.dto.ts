import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MarketSubmissionStatus } from '@topiadesk/db';

export class CreateMarketSubmissionDto {
  @ApiProperty() @IsUUID() carrierId!: string;
  @ApiProperty({ required: false, description: 'Decimal amount, e.g. "4200000.00"' }) @IsOptional() @IsString() quotedPremium?: string;
  @ApiProperty({ enum: MarketSubmissionStatus, required: false }) @IsOptional() @IsEnum(MarketSubmissionStatus) status?: MarketSubmissionStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class UpdateMarketSubmissionDto extends PartialType(CreateMarketSubmissionDto) {}

export class MarketSubmissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() opportunityId!: string;
  @ApiProperty() carrierId!: string;
  @ApiProperty({ nullable: true }) quotedPremium!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() submittedAt!: Date;
  @ApiProperty({ nullable: true }) respondedAt!: Date | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
}
