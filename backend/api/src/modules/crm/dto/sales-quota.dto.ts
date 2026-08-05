import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { QuotaPeriodType, QuotaScopeType } from '@topiadesk/db';

export class CreateSalesQuotaDto {
  @ApiProperty({ enum: QuotaScopeType }) @IsEnum(QuotaScopeType) scopeType!: QuotaScopeType;
  // Exactly one of userId/departmentId/branchId must be set, matching
  // scopeType (sales_quotas_scope_target_consistent CHECK constraint,
  // prisma/rls/003_check_constraints.sql) — validated explicitly in the
  // controller for a clean 400, same precedent as Contact's
  // assertExactlyOneParent.
  @ApiProperty({ required: false, description: 'Required when scopeType=USER' }) @IsOptional() @IsUUID() userId?: string;
  @ApiProperty({ required: false, description: 'Required when scopeType=DEPARTMENT' }) @IsOptional() @IsUUID() departmentId?: string;
  @ApiProperty({ required: false, description: 'Required when scopeType=BRANCH' }) @IsOptional() @IsUUID() branchId?: string;
  @ApiProperty({ enum: QuotaPeriodType }) @IsEnum(QuotaPeriodType) periodType!: QuotaPeriodType;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() periodStart!: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsDateString() periodEnd!: string;
  @ApiProperty({ description: 'Decimal amount, e.g. "5000000.00"' }) @IsString() @MinLength(1) targetAmount!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
}

export class UpdateSalesQuotaDto extends PartialType(CreateSalesQuotaDto) {}

export class SalesQuotaQueryDto {
  @ApiProperty({ enum: QuotaScopeType, required: false }) @IsOptional() @IsEnum(QuotaScopeType) scopeType?: QuotaScopeType;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() userId?: string;
}

export class SalesQuotaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: QuotaScopeType }) scopeType!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty({ nullable: true }) departmentId!: string | null;
  @ApiProperty({ nullable: true }) branchId!: string | null;
  @ApiProperty({ enum: QuotaPeriodType }) periodType!: string;
  @ApiProperty() periodStart!: Date;
  @ApiProperty() periodEnd!: Date;
  @ApiProperty({ description: 'Decimal serialized as string' }) targetAmount!: string;
  @ApiProperty({ nullable: true }) lineOfBusiness!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class QuotaAttainmentResponseDto {
  @ApiProperty({ description: 'Decimal serialized as string' }) targetAmount!: string;
  @ApiProperty({ description: 'Decimal serialized as string — sum of won Opportunities in the quota\'s period/scope' }) wonAmount!: string;
  @ApiProperty() attainmentPct!: number;
}
