import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsEmail, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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
