import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupportTicketDto {
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiProperty() @IsString() @MinLength(1) description!: string;
  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export class SupportTicketCommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorName!: string;
  @ApiPropertyOptional() authorPlatformAdminId?: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}

export class SupportTicketResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() description!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty() raisedByName!: string;
  @ApiProperty() raisedByEmail!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: [SupportTicketCommentResponseDto] })
  comments?: SupportTicketCommentResponseDto[];
}

export class CreateSupportTicketCommentDto {
  @ApiProperty() @IsString() @MinLength(1) body!: string;
}
