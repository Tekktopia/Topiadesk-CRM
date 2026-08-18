import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBooleanString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { TerritoryType } from '@topiadesk/db';

export class CreateTerritoryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: TerritoryType }) @IsEnum(TerritoryType) type!: TerritoryType;
  @ApiPropertyOptional({ description: 'Parent territory, for a region → branch hierarchy.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
  @ApiPropertyOptional({ description: 'Who is accountable for this book.' })
  @IsOptional()
  @IsUUID()
  managerId?: string;
  @ApiPropertyOptional({ description: 'Producers working this book.', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}

export class UpdateTerritoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: TerritoryType }) @IsOptional() @IsEnum(TerritoryType) type?: TerritoryType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional({ type: [String], description: 'Replaces the member list wholesale when supplied.' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
  @ApiPropertyOptional({ description: 'Soft-disable. Accounts keep pointing at a retired territory so history stays readable.' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}

export class TerritoryQueryDto {
  @ApiPropertyOptional({ enum: TerritoryType }) @IsOptional() @IsEnum(TerritoryType) type?: TerritoryType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional({ description: 'Territories this user is a member of.' })
  @IsOptional()
  @IsUUID()
  memberId?: string;
  /** String, not boolean — see AccountQueryDto.includeArchived for why. */
  @ApiPropertyOptional({ description: "'true' / 'false'. Omit for both." })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ default: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;
}

/** Bulk-assign accounts into a book, so a territory can be populated without touching each client. */
export class AssignAccountsToTerritoryDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  accountIds!: string[];
}

export class TerritoryMemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ nullable: true }) fullName!: string | null;
}

export class TerritoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: TerritoryType }) type!: string;
  @ApiProperty({ nullable: true }) parentId!: string | null;
  @ApiProperty({ nullable: true }) parentName!: string | null;
  @ApiProperty({ nullable: true }) managerId!: string | null;
  @ApiProperty({ nullable: true }) managerName!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [TerritoryMemberDto] }) members!: TerritoryMemberDto[];
  /** Clients sitting in this book — the number that makes a territory real rather than decorative. */
  @ApiProperty() accountCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/**
 * Territory aggregates.
 *
 * `unassignedAccounts` is the one worth watching: clients in nobody's book
 * are the ones that quietly go unserviced, and before territories existed
 * there was no way to even ask the question.
 */
export class TerritoryStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty({ description: 'Territories with no members assigned — a book nobody works.' })
  withoutMembers!: number;
  @ApiProperty({ description: 'Accounts not in any territory.' }) unassignedAccounts!: number;
  @ApiProperty({ description: 'Accounts placed in a territory.' }) assignedAccounts!: number;
}
