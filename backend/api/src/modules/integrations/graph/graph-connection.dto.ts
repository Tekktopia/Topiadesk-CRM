import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional } from 'class-validator';

export class UpdateGraphConnectionDto {
  /**
   * Strings, not booleans — the global ValidationPipe's
   * enableImplicitConversion casts a boolean-typed field with Boolean(), so
   * "false" would arrive as `true` and the toggle could never be turned off.
   * See AccountQueryDto.includeArchived for the full explanation.
   */
  @ApiPropertyOptional({ description: "'true' / 'false'" })
  @IsOptional()
  @IsBooleanString()
  calendarSyncEnabled?: string;

  @ApiPropertyOptional({ description: "'true' / 'false'" })
  @IsOptional()
  @IsBooleanString()
  mailSyncEnabled?: string;
}

export class GraphConnectionStatusDto {
  @ApiProperty({ description: 'Whether this user has linked a mailbox.' }) connected!: boolean;
  @ApiProperty({ description: 'Whether the deployment has Microsoft credentials at all — distinguishes "you have not connected" from "nobody can".' })
  configured!: boolean;
  @ApiProperty({ nullable: true }) microsoftUpn!: string | null;
  @ApiProperty({ nullable: true, description: 'CONNECTED | NEEDS_RECONSENT | DISABLED' }) status!: string | null;
  @ApiProperty() calendarSyncEnabled!: boolean;
  @ApiProperty() mailSyncEnabled!: boolean;
  @ApiProperty({ nullable: true }) lastSyncedAt!: Date | null;
  @ApiProperty({ nullable: true, description: 'Why the last run failed, if it did.' }) lastSyncError!: string | null;
}
