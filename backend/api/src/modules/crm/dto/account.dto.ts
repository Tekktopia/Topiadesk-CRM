import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsBooleanString, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from 'class-validator';
import { AccountStatus, AccountType, KycStatus, RiskRating } from '@topiadesk/db';

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
  @ApiProperty({ enum: KycStatus, required: false }) @IsOptional() @IsEnum(KycStatus) kycStatus?: KycStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() kycExpiryDate?: string;
  @ApiProperty({ required: false, description: 'NAICOM (insurance regulator) ID — alphanumeric, 4-20 chars' }) @IsOptional() @Matches(/^[A-Z0-9]{4,20}$/, { message: 'naicomId must be 4-20 alphanumeric characters (uppercase)' }) naicomId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() parentAccountId?: string;
  // Defaults to the calling user if omitted — see AccountsController.create().
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() source?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ type: [String], description: 'Free-form labels, e.g. "high-value", "at-risk-renewal"' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
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
  @ApiPropertyOptional({ description: 'Matches accounts carrying this tag' }) @IsOptional() @IsString() tag?: string;
  /**
   * A STRING, not a boolean, and compared explicitly at the point of use.
   *
   * main.ts runs the global ValidationPipe with
   * `transformOptions: { enableImplicitConversion: true }`, and that
   * conversion happens BEFORE any @Transform runs: class-transformer sees a
   * `boolean`-typed property, casts the incoming string with Boolean(), and
   * the non-empty string "false" becomes `true`. A @Transform guard placed
   * on such a property therefore receives an already-coerced `true` and can
   * never recover the caller's intent — the flag ends up permanently ON.
   * Verified live: ?includeArchived=false returned the archived rows anyway.
   *
   * Keeping the property a string sidesteps the cast entirely (implicit
   * conversion to String is a no-op here), which is why every boolean query
   * flag in this codebase is modelled this way.
   */
  @ApiPropertyOptional({ default: 'false', description: "Include soft-archived accounts (excluded by default). Send 'true' to include." })
  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;
  @ApiProperty({ required: false, default: 50 }) @IsOptional() @IsInt() @Min(1) take?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) skip?: number;
}

/**
 * Book-of-business aggregates for the Accounts page header.
 *
 * `atRisk` counts accounts whose relationship healthScore has fallen into
 * the low band — the same 40 threshold the shared ScoreMeter uses, so the
 * tile and the per-row meter agree. Accounts the health job has not scored
 * yet (healthScore null) are NOT counted as at-risk: unknown is not bad.
 *
 * `kycExpired` is surfaced because it actively blocks work — a policy
 * version cannot be created against an account whose KYC has lapsed (see
 * Account.kycStatus in schema.prisma), so it is an operational blocker
 * rather than a vanity metric.
 */
export class AccountStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty() clients!: number;
  @ApiProperty() prospects!: number;
  @ApiProperty({ description: 'Scored accounts with healthScore below 40.' }) atRisk!: number;
  @ApiProperty({ description: 'Mean healthScore across scored accounts, rounded; 0 when none are scored.' })
  averageHealthScore!: number;
  @ApiProperty({ description: 'Accounts whose KYC has expired — blocks new policy versions.' }) kycExpired!: number;
}

export class TransferAccountOwnerDto {
  @ApiProperty() @IsUUID() newOwnerId!: string;
  @ApiPropertyOptional({ description: 'Captured on the OWNERSHIP_TRANSFERRED audit row' }) @IsOptional() @IsString() reason?: string;
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
