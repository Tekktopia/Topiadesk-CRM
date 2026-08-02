import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePolicyDto {
  @ApiProperty() @IsString() @MinLength(1) policyNumber!: string;
  @ApiProperty() @IsUUID() accountId!: string;
  @ApiProperty() @IsUUID() carrierId!: string;
  @ApiProperty() @IsString() @MinLength(1) lineOfBusiness!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() inceptionDate!: string;
  @ApiProperty() @IsDateString() expiryDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brokerOfRecordId?: string;
}
