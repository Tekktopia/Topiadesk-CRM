import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
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
