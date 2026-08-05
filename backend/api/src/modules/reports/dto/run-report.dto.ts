import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * `filters` is intentionally untyped here (`Record<string, unknown>`) —
 * class-validator can't know its shape statically since it depends on
 * which report `:key` the request targets. ReportsController re-validates
 * it against that specific report's own zod `filterSchema` (unknown keys
 * rejected there) before ever passing it to `execute()`. This DTO only
 * guards the request's own shape.
 */
export class RunReportDto {
  @ApiProperty({ type: Object, description: 'Validated server-side against the target report\'s own filterSchema' })
  @IsObject()
  filters!: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'Must be one of the report\'s allowedDimensions keys' })
  @IsOptional()
  @IsString()
  dimension?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) page?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) @Max(1000) pageSize?: number;
}

export class ExportReportQueryDto {
  @ApiProperty({ enum: ['xlsx', 'csv', 'pdf'] })
  @IsIn(['xlsx', 'csv', 'pdf'])
  format!: 'xlsx' | 'csv' | 'pdf';

  @ApiProperty({ required: false, description: 'JSON-encoded filters object, validated the same way as POST .../run' })
  @IsOptional()
  @IsString()
  filters?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsString() dimension?: string;
}

export class ReportDownloadResponseDto {
  @ApiProperty() downloadUrl!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty() expiresInSeconds!: number;
}
