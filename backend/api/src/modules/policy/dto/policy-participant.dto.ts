import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ParticipantType } from '@topiadesk/db';

/**
 * `name` is always required, even when `contactId` links a real Contact —
 * beneficiary/nominee designations are conventionally captured as of a
 * point in time and don't retroactively change if the Contact record is
 * later edited (same reasoning as the schema comment on PolicyParticipant).
 */
export class CreatePolicyParticipantDto {
  @ApiProperty({ enum: ParticipantType }) @IsEnum(ParticipantType) participantType!: ParticipantType;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relationship?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() percentage?: string;
}

export class UpdatePolicyParticipantDto {
  @ApiPropertyOptional({ enum: ParticipantType }) @IsOptional() @IsEnum(ParticipantType) participantType?: ParticipantType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() relationship?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() percentage?: string;
}

export class PolicyParticipantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty({ enum: ParticipantType }) participantType!: ParticipantType;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) contactId!: string | null;
  @ApiProperty({ nullable: true }) relationship!: string | null;
  @ApiProperty({ nullable: true }) percentage!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
