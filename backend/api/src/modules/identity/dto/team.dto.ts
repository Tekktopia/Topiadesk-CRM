import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const TEAM_MEMBER_ROLES = ['MEMBER', 'LEAD'] as const;
type TeamMemberRoleValue = (typeof TEAM_MEMBER_ROLES)[number];

export class TeamMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() userFullName!: string;
  @ApiProperty() userEmail!: string;
  @ApiProperty({ enum: TEAM_MEMBER_ROLES }) role!: string;
  @ApiProperty() createdAt!: Date;
}

/** Additive visibility-grant grouping (see schema.prisma's TeamMember comment) — not a 3rd nested RLS level. */
export class TeamResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() memberCount!: number;
  @ApiPropertyOptional({ type: [TeamMemberResponseDto] }) members?: TeamMemberResponseDto[];
}

export class CreateTeamDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateTeamDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class AddTeamMemberDto {
  @ApiProperty() @IsUUID() userId!: string;

  @ApiPropertyOptional({ enum: TEAM_MEMBER_ROLES, default: 'MEMBER' })
  @IsOptional()
  @IsEnum(TEAM_MEMBER_ROLES)
  role?: TeamMemberRoleValue;
}

export class UpdateTeamMemberDto {
  @ApiProperty({ enum: TEAM_MEMBER_ROLES })
  @IsEnum(TEAM_MEMBER_ROLES)
  role!: TeamMemberRoleValue;
}
