import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const VERSION_TYPES = ['ISSUANCE', 'ENDORSEMENT', 'RENEWAL', 'CANCELLATION', 'REINSTATEMENT'] as const;

export class CreatePolicyVersionDto {
  @ApiProperty({ enum: VERSION_TYPES }) @IsIn(VERSION_TYPES) versionType!: (typeof VERSION_TYPES)[number];
  @ApiProperty() @IsDateString() effectiveDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() changeDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() premiumImpact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsuredAtVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() documentId?: string;
}
