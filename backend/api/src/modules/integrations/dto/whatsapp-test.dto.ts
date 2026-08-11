import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

/** POST /integrations/whatsapp/test — exercises WhatsAppCloudService.sendTemplateMessage's stub without needing a live connector configured first. */
export class WhatsAppTestDto {
  @ApiProperty() @IsString() @MinLength(1) to!: string;
  @ApiProperty() @IsString() @MinLength(1) templateName!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) params?: string[];
}

export class WhatsAppTestResponseDto {
  @ApiProperty() messageId!: string;
}
