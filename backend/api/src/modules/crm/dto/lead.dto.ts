import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { AccountType, LeadSource, LeadStatus } from '@topiadesk/db';

export class CreateLeadDto {
  @ApiProperty({ enum: LeadSource }) @IsEnum(LeadSource) source!: LeadSource;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sourceCampaign?: string;
  @ApiProperty() @IsString() @MinLength(1) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) lastName!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() companyName?: string;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @ApiProperty({ enum: LeadStatus, required: false }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() qualificationNotes?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class LeadQueryDto {
  @ApiProperty({ enum: LeadStatus, required: false }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiProperty({ enum: LeadSource, required: false }) @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(100) minScore?: number;
}

export class UpdateLeadScoreDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) score!: number;
}

export class LeadResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ nullable: true }) sourceCampaign!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) companyName!: string | null;
  @ApiProperty() score!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) assignedToId!: string | null;
  @ApiProperty({ nullable: true }) convertedAccountId!: string | null;
  @ApiProperty({ nullable: true }) convertedOpportunityId!: string | null;
  @ApiProperty({ nullable: true }) qualificationNotes!: string | null;
  @ApiProperty() createdAt!: Date;
}

/**
 * Links to an existing Account when existingAccountId is set; otherwise a
 * new Account is created from accountName (+ optional fields). Exactly one
 * of these two modes applies — validated in LeadsController.convert().
 */
export class ConvertLeadRequestDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() existingAccountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) accountName?: string;
  @ApiProperty({ enum: AccountType, required: false }) @IsOptional() @IsEnum(AccountType) accountType?: AccountType;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() industryId?: string;
  @ApiProperty({ required: false, description: 'Defaults to the lead assignee, then the calling user' })
  @IsOptional()
  @IsUUID()
  accountOwnerId?: string;

  @ApiProperty() @IsString() @MinLength(1) opportunityName!: string;
  @ApiProperty() @IsUUID() pipelineStageId!: string;
  @ApiProperty({ description: 'Decimal amount, e.g. "45000000.00"' }) @IsString() amount!: string;
  @ApiProperty({ required: false, description: 'Defaults to the target stage defaultProbability' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @ApiProperty() @IsDateString() expectedCloseDate!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lineOfBusiness?: string;
  @ApiProperty({ required: false, description: 'Defaults to the lead assignee, then the calling user' })
  @IsOptional()
  @IsUUID()
  opportunityOwnerId?: string;
}

export class ConvertLeadResponseDto {
  @ApiProperty() lead!: LeadResponseDto;
  @ApiProperty() accountId!: string;
  @ApiProperty() opportunityId!: string;
}
