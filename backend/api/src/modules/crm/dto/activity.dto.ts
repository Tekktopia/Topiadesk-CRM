import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { ActivityDirection, ActivityType } from '@topiadesk/db';

export class CreateActivityDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() contactId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leadId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() policyId?: string;
  @ApiProperty({ enum: ActivityType }) @IsEnum(ActivityType) type!: ActivityType;
  @ApiProperty({ enum: ActivityDirection }) @IsEnum(ActivityDirection) direction!: ActivityDirection;
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() body?: string;
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) durationMinutes?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() outcome?: string;
}

export class ActivityQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leadId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() policyId?: string;
  @ApiProperty({ enum: ActivityType, required: false }) @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
}

export class ActivityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) accountId!: string | null;
  @ApiProperty({ nullable: true }) contactId!: string | null;
  @ApiProperty({ nullable: true }) leadId!: string | null;
  @ApiProperty({ nullable: true }) opportunityId!: string | null;
  @ApiProperty({ nullable: true }) policyId!: string | null;
  @ApiProperty() type!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ nullable: true }) body!: string | null;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty() createdById!: string;
  @ApiProperty({ nullable: true }) durationMinutes!: number | null;
  @ApiProperty({ nullable: true }) outcome!: string | null;
  @ApiProperty() createdAt!: Date;
}
