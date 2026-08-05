import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

const OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in'] as const;

export class CustomReportFilterDto {
  @ApiProperty() @IsString() field!: string;
  @ApiProperty({ enum: OPERATORS }) @IsIn(OPERATORS) operator!: (typeof OPERATORS)[number];
  /**
   * Deliberately `unknown` at the DTO layer — the controller re-validates
   * this against the field's declared type (string/number/date/boolean)
   * from the registry before it ever reaches a Prisma `where` clause.
   * class-validator can't express "type depends on another field's runtime
   * value" declaratively. `@IsDefined()` (not just `@ApiProperty()`) is
   * required here for a subtler reason: the global ValidationPipe runs with
   * `whitelist: true`, which strips/rejects any property with zero
   * class-validator decorators, regardless of `@ApiProperty()` — a
   * Swagger-only decorator carries no class-validator metadata. Without
   * this, every filter's `value` was rejected as "should not exist" even
   * though it's declared right here.
   */
  @ApiProperty() @IsDefined() value!: unknown;
}

export class RunCustomReportDto {
  @ApiProperty({ description: 'Must be a key in CUSTOM_REPORT_REGISTRY' }) @IsString() entity!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) fields!: string[];
  @ApiProperty({ type: [CustomReportFilterDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomReportFilterDto)
  filters?: CustomReportFilterDto[];
  @ApiProperty({ type: [String], required: false }) @IsOptional() @IsArray() @IsString({ each: true }) groupBy?: string[];
  @ApiProperty({ required: false, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export class CustomReportFieldDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() type!: string;
  @ApiProperty() filterable!: boolean;
  @ApiProperty() groupable!: boolean;
}

export class CustomReportEntityDto {
  @ApiProperty() entity!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: [CustomReportFieldDto] }) fields!: CustomReportFieldDto[];
}

export class CustomReportResultDto {
  @ApiProperty({ type: [Object] }) rows!: Record<string, unknown>[];
  @ApiProperty() totalCount!: number;
}
