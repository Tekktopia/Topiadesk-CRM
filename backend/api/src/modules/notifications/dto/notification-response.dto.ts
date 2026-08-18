import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBooleanString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ListMyNotificationsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  /** 'true'|'false' as a query string, not a JSON boolean — same convention as every other GET query filter in this codebase. */
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional() @IsBooleanString() isRead?: string;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export class BulkNotificationIdsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) ids!: string[];
}

export class NotificationBulkActionResponseDto {
  @ApiProperty({ type: [String] }) requested!: string[];
  @ApiProperty({ type: [String] }) affected!: string[];
  @ApiProperty({ type: [String] }) skipped!: string[];
}
