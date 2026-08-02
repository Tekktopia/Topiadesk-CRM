import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePremiumDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() policyVersionId?: string;
  @ApiProperty() @IsString() grossPremium!: string;
  @ApiProperty() @IsString() netPremium!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commissionRate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commissionAmount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() installmentPlan?: string;
  @ApiProperty() @IsDateString() dueDate!: string;
}
