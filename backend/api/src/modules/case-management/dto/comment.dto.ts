import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ActivityDirection, ActivityType } from '@topiadesk/db';

/**
 * Comment/note threading on Claim/Case reuses Activity (claimId/caseId,
 * direction: INTERNAL for internal notes) rather than a new CaseComment
 * table — see the schema's Phase 2 Case Management doc comment. Defaults
 * favor the common case: an agent typing an internal note (direction
 * INTERNAL, type NOTE), with OUTBOUND/INBOUND/other types available for
 * logging an actual call/email/etc. against the claim or case.
 */
export class CreateCommentDto {
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ enum: ActivityType, default: 'NOTE' }) @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
  @ApiPropertyOptional({ enum: ActivityDirection, default: 'INTERNAL' }) @IsOptional() @IsEnum(ActivityDirection) direction?: ActivityDirection;
  @ApiPropertyOptional({ description: 'Defaults to now' }) @IsOptional() @IsDateString() occurredAt?: string;
  /**
   * Explicit recipient override for an OUTBOUND Case comment's customer
   * email — SendCaseEmailDialog's To field. Only meaningful when
   * direction is OUTBOUND and this is a Case (not a Claim) comment; when
   * omitted, comments.service.ts falls back to the case's own
   * auto-resolved contact email (unchanged legacy behavior, e.g. the
   * generic Log Activity form).
   */
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsEmail({}, { each: true }) emailTo?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsEmail({}, { each: true }) emailCc?: string[];
}

export class CommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) claimId!: string | null;
  @ApiProperty({ nullable: true }) caseId!: string | null;
  @ApiProperty() type!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ nullable: true }) body!: string | null;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty({ nullable: true }) createdBySystemJob!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Only set for OUTBOUND comments on a Case — whether the customer-facing email actually sent.' })
  emailDeliveryStatus?: string | null;
  @ApiProperty({ type: [String], description: 'Actual recipients once the email sends (explicit or auto-resolved) — empty until then.' }) emailTo!: string[];
  @ApiProperty({ type: [String] }) emailCc!: string[];
  @ApiProperty() createdAt!: Date;
}
