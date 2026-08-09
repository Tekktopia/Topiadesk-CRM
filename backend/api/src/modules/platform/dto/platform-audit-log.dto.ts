import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformAuditLogResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() actorPlatformAdminId?: string | null;
  @ApiPropertyOptional() actorName?: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiPropertyOptional() detail?: Record<string, unknown> | null;
  @ApiProperty() createdAt!: Date;
}
