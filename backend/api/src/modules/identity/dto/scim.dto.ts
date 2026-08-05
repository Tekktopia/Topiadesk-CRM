import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * SCIM 2.0 (RFC 7643/7644) request shapes. Deliberately loose — SCIM
 * clients (Okta, Azure AD, OneLogin, ...) vary in exactly which optional
 * fields they send, and this is the receiving side of an external
 * contract, not internal API design where strict validation is
 * unambiguously correct. Response shapes are built as plain objects in
 * scim.controller.ts (buildScimUser/buildScimGroup) rather than
 * response DTO classes — SCIM responses are inherently dynamic
 * (schemas-driven JSON), a fixed class would just be decorative here.
 */
export class ScimNameDto {
  @ApiPropertyOptional() @IsOptional() @IsString() givenName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() familyName?: string;
}

export class ScimEmailDto {
  @ApiProperty() @IsString() value!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() primary?: boolean;
}

export class ScimUserRequestDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() schemas?: string[];

  @ApiProperty({ description: 'Treated as this user\'s email — TopiaDesk keys users by email, not a separate username' })
  @IsString()
  userName!: string;

  @ApiPropertyOptional({ type: ScimNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScimNameDto)
  name?: ScimNameDto;

  @ApiPropertyOptional({ type: [ScimEmailDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScimEmailDto)
  emails?: ScimEmailDto[];

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;

  @ApiPropertyOptional({ description: 'Maps to departments.code — same custom-attribute convention as the Keycloak sync webhook' })
  @IsOptional()
  @IsString()
  departmentCode?: string;

  @ApiPropertyOptional({ description: 'Maps to branches.code' })
  @IsOptional()
  @IsString()
  branchCode?: string;
}

export class ScimPatchOperationDto {
  @ApiProperty({ enum: ['add', 'replace', 'remove'] }) @IsString() op!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() path?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) value?: unknown;
}

export class ScimPatchRequestDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() schemas?: string[];

  @ApiProperty({ type: [ScimPatchOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScimPatchOperationDto)
  Operations!: ScimPatchOperationDto[];
}

export class ScimGroupMemberDto {
  @ApiProperty({ description: "TopiaDesk user id" }) @IsString() value!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() display?: string;
}

export class ScimGroupRequestDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() schemas?: string[];

  @ApiProperty({ description: 'Maps to departments.name (and, under the department_code mapping strategy, also used to derive departments.code)' })
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({ type: [ScimGroupMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScimGroupMemberDto)
  members?: ScimGroupMemberDto[];
}
