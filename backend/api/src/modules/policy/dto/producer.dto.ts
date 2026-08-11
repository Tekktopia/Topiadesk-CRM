import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ProducerStatus, ProducerType } from '@topiadesk/db';

export class CreateProducerDto {
  @ApiProperty() @IsString() @MinLength(1) producerCode!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: ProducerType }) @IsEnum(ProducerType) type!: ProducerType;
  @ApiPropertyOptional({ enum: ProducerStatus }) @IsOptional() @IsEnum(ProducerStatus) status?: ProducerStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() licenseExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentProducerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() linkedUserId?: string;
}

/** Hand-written rather than PartialType(CreateProducerDto) — same convention as UpdatePremiumDto/UpdatePolicyDto in this module. */
export class UpdateProducerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) producerCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ enum: ProducerType }) @IsOptional() @IsEnum(ProducerType) type?: ProducerType;
  @ApiPropertyOptional({ enum: ProducerStatus }) @IsOptional() @IsEnum(ProducerStatus) status?: ProducerStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() licenseExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentProducerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() linkedUserId?: string;
}

export class ProducerResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() producerCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ProducerType }) type!: ProducerType;
  @ApiProperty({ enum: ProducerStatus }) status!: ProducerStatus;
  @ApiProperty({ nullable: true }) licenseNumber!: string | null;
  @ApiProperty({ nullable: true }) licenseExpiry!: Date | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) parentProducerId!: string | null;
  @ApiProperty({ nullable: true }) linkedUserId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
