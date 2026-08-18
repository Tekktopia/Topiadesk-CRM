import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsBooleanString, IsEmail, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateContactDto {
  // Exactly one of accountId/carrierId must be set (contacts_exactly_one_parent
  // CHECK constraint) — validated explicitly in the controller for a clean 400
  // instead of surfacing the raw Postgres constraint violation.
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() carrierId?: string;
  @ApiProperty({ required: false, description: 'Which of the account\'s Sites (branches) this contact belongs to, if any' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
  @ApiProperty() @IsString() @MinLength(1) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) lastName!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false, description: 'Only meaningful when the parent account is HOUSEHOLD — Spouse/Child/Dependent/etc.' })
  @IsOptional()
  @IsString()
  householdRole?: string;
  @ApiProperty({ required: false, description: 'National ID, Passport, Driver\'s License, Utility Bill, CAC, etc.' })
  @IsOptional()
  @IsString()
  idType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() idNumber?: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isPrimary?: boolean;
  // Validated against active CustomFieldDefinition rows for CONTACT in
  // ContactsController before write — see custom-fields.validator.ts.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateContactDto extends PartialType(CreateContactDto) {}

export class ContactQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() carrierId?: string;
  @ApiPropertyOptional({ description: 'Free-text search across first/last name, email, phone and job title.' })
  @IsOptional()
  @IsString()
  q?: string;
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
   * Verified live: ?includeArchived=false returned the archived rows anyway;
   * this field had the identical defect.
   *
   * Keeping the property a string sidesteps the cast entirely (implicit
   * conversion to String is a no-op here), which is why every boolean query
   * flag in this codebase is modelled this way.
   */
  @ApiPropertyOptional({ description: "Only primary contacts when 'true', only non-primary when 'false'. Omit for both." })
  @IsOptional()
  @IsBooleanString()
  isPrimary?: string;
  @ApiPropertyOptional({ description: 'Max rows to return (default 50).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
  @ApiPropertyOptional({ description: 'Rows to skip, for pagination.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

/**
 * Contact-book aggregates for the page header.
 *
 * `reachable` counts contacts with at least one of email/phone — the
 * practical "can we actually contact this person" figure, which is the whole
 * point of a contact record and is invisible from a row count alone.
 * Anonymized contacts (GDPR erasure, see Contact.anonymizedAt) are counted
 * separately rather than silently inflating the others.
 */
export class ContactStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Contacts flagged as the primary contact for their account.' }) primary!: number;
  @ApiProperty({ description: 'Contacts with an email address, a phone number, or both.' }) reachable!: number;
  @ApiProperty({ description: 'Contacts with neither email nor phone on file.' }) unreachable!: number;
  @ApiProperty({ description: 'Contacts erased under a data-subject request.' }) anonymized!: number;
}

export class ContactResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) accountId!: string | null;
  @ApiProperty({ nullable: true }) carrierId!: string | null;
  @ApiProperty({ nullable: true }) siteId!: string | null;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) title!: string | null;
  @ApiProperty({ nullable: true }) householdRole!: string | null;
  @ApiProperty({ nullable: true }) idType!: string | null;
  @ApiProperty({ nullable: true }) idNumber!: string | null;
  @ApiProperty() isPrimary!: boolean;
  /** Set once a DataSubjectRequest DELETE has been processed for this contact — see that model's schema comment. */
  @ApiProperty({ nullable: true }) anonymizedAt!: Date | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) customFields!: unknown;
  @ApiProperty() createdAt!: Date;
}

// Contact has no owner/assignee column — bulk/assign reassigns accountId
// instead (the closest analog: "move these contacts under a different
// account"), matching how AccountsController's own comment already frames
// Contact as always reached through an Account.
export class BulkAssignContactsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() accountId!: string;
}

export class BulkUpdateContactsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class BulkDeleteContactsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}
