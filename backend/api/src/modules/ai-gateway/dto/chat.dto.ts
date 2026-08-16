import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
}

export class ChatSessionResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) title!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ChatMessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['USER', 'ASSISTANT'] }) role!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
}

export class SendChatMessageResponseDto {
  @ApiProperty({ type: ChatMessageResponseDto }) userMessage!: ChatMessageResponseDto;
  @ApiProperty({ type: ChatMessageResponseDto }) assistantMessage!: ChatMessageResponseDto;
  @ApiProperty() estimatedCostUsd!: number;
}
