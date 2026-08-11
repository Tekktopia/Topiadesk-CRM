import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePolicyCoverageDto {
  @ApiProperty() @IsString() @MinLength(1) coverageName!: string;
  @ApiProperty() @IsString() @MinLength(1) coverageType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() premium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deductible?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limits?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subLimits?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conditions?: string;
}

/** Hand-written rather than PartialType — same convention as UpdatePremiumDto/UpdatePolicyDto in this module. */
export class UpdatePolicyCoverageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) coverageName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) coverageType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() premium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deductible?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limits?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subLimits?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conditions?: string;
}

export class PolicyCoverageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() coverageName!: string;
  @ApiProperty() coverageType!: string;
  @ApiProperty({ nullable: true }) sumInsured!: string | null;
  @ApiProperty({ nullable: true }) premium!: string | null;
  @ApiProperty({ nullable: true }) deductible!: string | null;
  @ApiProperty({ nullable: true }) limits!: string | null;
  @ApiProperty({ nullable: true }) subLimits!: string | null;
  @ApiProperty({ nullable: true }) conditions!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
