import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateSupportTicketDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_TENANT', 'RESOLVED', 'CLOSED'] })
  @IsOptional()
  @IsEnum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_TENANT', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_TENANT' | 'RESOLVED' | 'CLOSED';

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @ApiPropertyOptional({ description: 'A PlatformAdminUser id, or null to unassign.' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}

export class CreatePlatformTicketCommentDto {
  @ApiProperty() @IsString() @MinLength(1) body!: string;
}

export class PlatformSupportTicketCommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorName!: string;
  @ApiPropertyOptional() authorPlatformAdminId?: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}

export class PlatformSupportTicketResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() description!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty() raisedByName!: string;
  @ApiProperty() raisedByEmail!: string;
  @ApiPropertyOptional() assignedToId?: string | null;
  @ApiPropertyOptional() assignedToName?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: [PlatformSupportTicketCommentResponseDto] })
  comments?: PlatformSupportTicketCommentResponseDto[];
}
