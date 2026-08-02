import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { AuditAction } from '@topiadesk/db';

export class AuditLogQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() entityType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() entityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() actorUserId?: string;
  @ApiProperty({ enum: AuditAction, required: false }) @IsOptional() @IsEnum(AuditAction) action?: AuditAction;
  @ApiProperty({ required: false, description: 'ISO 8601 — matches createdAt >= from' }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ required: false, description: 'ISO 8601 — matches createdAt <= to' }) @IsOptional() @IsDateString() to?: string;
  @ApiProperty({ required: false, default: 50 }) @IsOptional() @IsInt() @Min(1) take?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) skip?: number;
}
