import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class AuditExportQueryDto {
  @ApiProperty({ enum: ['csv', 'ndjson'] }) @IsIn(['csv', 'ndjson']) format!: 'csv' | 'ndjson';
  @ApiPropertyOptional({ description: 'ISO 8601 — matches createdAt >= from' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ description: 'ISO 8601 — matches createdAt <= to' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
}

export class AuditVerifyQueryDto {
  @ApiPropertyOptional({ description: 'Bounds the verified range to createdAt > this checkpoint\'s checkpointAt; omit to verify from genesis' })
  @IsOptional()
  @IsUUID()
  fromCheckpointId?: string;

  @ApiPropertyOptional({ description: "Bounds the verified range to createdAt <= this checkpoint's checkpointAt; omit to verify up to now" })
  @IsOptional()
  @IsUUID()
  toCheckpointId?: string;
}
