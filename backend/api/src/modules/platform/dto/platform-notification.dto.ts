import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformNotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() body?: string | null;
  @ApiPropertyOptional() entityType?: string | null;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiPropertyOptional() readAt?: Date | null;
  @ApiProperty() createdAt!: Date;
}
