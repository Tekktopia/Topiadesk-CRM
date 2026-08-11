import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DataSubjectRequestStatus, DataSubjectRequestType } from '@topiadesk/db';

export class CreateDataSubjectRequestDto {
  @ApiProperty() @IsUUID() contactId!: string;
  @ApiProperty({ enum: DataSubjectRequestType }) @IsEnum(DataSubjectRequestType) requestType!: DataSubjectRequestType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class RejectDataSubjectRequestDto {
  @ApiProperty() @IsString() @MinLength(1) reason!: string;
}

export class DataSubjectRequestQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional({ enum: DataSubjectRequestStatus }) @IsOptional() @IsEnum(DataSubjectRequestStatus) status?: DataSubjectRequestStatus;
}

export class DataSubjectRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() contactId!: string;
  @ApiProperty({ enum: DataSubjectRequestType }) requestType!: string;
  @ApiProperty({ enum: DataSubjectRequestStatus }) status!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() requestedById!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) exportData!: unknown;
  @ApiProperty({ nullable: true }) processedById!: string | null;
  @ApiProperty({ nullable: true }) processedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
