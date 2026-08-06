import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CaseType } from '@topiadesk/db';

export class PortalPolicyDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty() lineOfBusiness!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) sumInsured!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() inceptionDate!: Date;
  @ApiProperty() expiryDate!: Date;
}

export class PortalCaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseNumber!: string;
  @ApiProperty() caseType!: string;
  @ApiProperty() subject!: string;
  @ApiPropertyOptional({ nullable: true }) description?: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
}

export class PortalCaseCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() subject!: string;
  @ApiPropertyOptional({ nullable: true }) body?: string | null;
  @ApiProperty() direction!: string;
  @ApiProperty() authorLabel!: string;
  @ApiProperty() occurredAt!: Date;
}

export class CreatePortalCaseDto {
  @ApiProperty({ enum: CaseType }) @IsEnum(CaseType) caseType!: CaseType;
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreatePortalCaseCommentDto {
  @ApiProperty() @IsString() @MinLength(1) body!: string;
}

export class PortalMeDto {
  @ApiProperty() contactName!: string;
  @ApiProperty() accountName!: string;
}

export class PortalDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() createdAt!: Date;
}
