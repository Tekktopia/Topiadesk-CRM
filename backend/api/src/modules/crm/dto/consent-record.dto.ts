import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateConsentRecordDto {
  @ApiProperty() @IsUUID() contactId!: string;
  @ApiProperty({ description: 'Free text, e.g. "Marketing Email", "Data Processing", "Third-Party Sharing" — no fixed catalog.' })
  @IsString()
  @MinLength(1)
  consentType!: string;
  @ApiProperty() @IsBoolean() granted!: boolean;
  @ApiProperty({ description: 'How this was captured, e.g. "Web form", "Verbal", "Portal", "Paper form".' })
  @IsString()
  @MinLength(1)
  source!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ConsentRecordQueryDto {
  @ApiProperty() @IsUUID() contactId!: string;
}

export class ConsentRecordResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() contactId!: string;
  @ApiProperty() consentType!: string;
  @ApiProperty() granted!: boolean;
  @ApiProperty() source!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true }) recordedById!: string | null;
  @ApiProperty() createdAt!: Date;
}

/** Current status per consentType — the most recent ConsentRecord row for each type, not a separate stored column (see that model's schema comment). */
export class CurrentConsentDto {
  @ApiProperty() consentType!: string;
  @ApiProperty() granted!: boolean;
  @ApiProperty() source!: string;
  @ApiProperty() recordedAt!: Date;
}
