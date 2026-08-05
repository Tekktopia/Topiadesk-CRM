import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class StartLiveChatSessionDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(1) initialMessage!: string;
}

export class LiveChatSessionResponseDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() sessionToken!: string;
}

export class PostLiveChatMessageDto {
  @ApiProperty() @IsString() @MinLength(1) message!: string;
  @ApiPropertyOptional({ description: 'Must match the sessionToken returned by session start' }) @IsOptional() @IsString() sessionToken?: string;
}

export class LiveChatMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() body!: string | null;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty({ description: 'true if this message came from an agent, false if from the visitor' }) fromAgent!: boolean;
}
