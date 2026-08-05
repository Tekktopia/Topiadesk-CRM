import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { AccountStatus, AccountType, RiskRating } from '@topiadesk/db';

export class CreateAccountDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: AccountType }) @IsEnum(AccountType) accountType!: AccountType;
  @ApiProperty({ enum: AccountStatus, required: false }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() industryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() annualRevenueBand?: string;
  @ApiProperty({ enum: RiskRating, required: false }) @IsOptional() @IsEnum(RiskRating) riskRating?: RiskRating;
  @ApiProperty({ required: false }) @IsOptional() @IsString() addressLine1?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() addressLine2?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() state?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() country?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() postalCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() parentAccountId?: string;
  // Defaults to the calling user if omitted — see AccountsController.create().
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() source?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  // Validated against active CustomFieldDefinition rows for ACCOUNT in
  // AccountsController before write — see custom-fields.validator.ts.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}

export class AccountQueryDto {
  @ApiProperty({ enum: AccountStatus, required: false }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() industryId?: string;
  @ApiProperty({ enum: RiskRating, required: false }) @IsOptional() @IsEnum(RiskRating) riskRating?: RiskRating;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false, description: 'Case-insensitive substring match on name' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiProperty({ required: false, default: 50 }) @IsOptional() @IsInt() @Min(1) take?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) skip?: number;
}

export class BulkAssignAccountsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() ownerId!: string;
}

// Explicit field allowlist, not Partial<UpdateAccountDto> — a fat-fingered
// bulk payload should only ever be able to touch these four columns, never
// arbitrary Account fields en masse.
export class BulkUpdateAccountsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ enum: AccountStatus, required: false }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @ApiProperty({ enum: RiskRating, required: false }) @IsOptional() @IsEnum(RiskRating) riskRating?: RiskRating;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() industryId?: string;
}

export class BulkDeleteAccountsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}
