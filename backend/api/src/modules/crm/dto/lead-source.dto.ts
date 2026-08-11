import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLeadSourceDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ description: 'Stable machine value — this is what Lead.source actually stores, e.g. "TRADE_SHOW"' })
  @IsString()
  @MinLength(1)
  code!: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() sortOrder?: number;
}

/** `code` is deliberately not in the mutable set — see Lead.source's schema.prisma comment: renaming it works (onUpdate: Cascade), but the admin UI doesn't offer it, same "not client-settable" treatment AssignmentRule gives entityType/lastAssignedUserId. */
class LeadSourceMutableFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateLeadSourceDto extends PartialType(LeadSourceMutableFieldsDto) {}

export class LeadSourceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
