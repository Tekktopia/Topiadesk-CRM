import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AdminNotificationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() recipientUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional({ enum: ['IN_APP', 'EMAIL', 'SMS'] }) @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'SENT', 'FAILED', 'READ'] }) @IsOptional() @IsString() status?: string;
}

export class AdminNotificationRecipientDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() email!: string;
}

/** Richer than the personal-inbox NotificationResponseDto (recipient
 * identity, channel, related-entity linkage) — this surface is for an
 * admin browsing every notification the system has sent, not a user
 * reading their own. */
export class AdminNotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() recipientUserId!: string;
  @ApiProperty({ type: AdminNotificationRecipientDto }) recipient!: AdminNotificationRecipientDto;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) relatedEntityType!: string | null;
  @ApiProperty({ nullable: true }) relatedEntityId!: string | null;
  @ApiProperty({ nullable: true }) sentAt!: Date | null;
  @ApiProperty({ nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
