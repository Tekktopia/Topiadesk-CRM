import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { MailProvider } from '@topiadesk/db';

export class UpsertMailSettingsDto {
  @ApiProperty({ enum: MailProvider }) @IsEnum(MailProvider) provider!: MailProvider;
  @ApiProperty() @IsString() @MinLength(1) host!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(65535) port!: number;
  @ApiProperty({ description: 'true for implicit TLS (465), false for STARTTLS (587).' })
  @IsBoolean()
  secure!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() username?: string;
  /**
   * Omit to KEEP the stored password. Sending an empty string is not the same
   * as omitting — it clears it. This is the masked-secret convention the
   * connector dialogs already use, and it exists so an admin can toggle
   * `isActive` or fix a typo in the host without re-typing the credential.
   */
  @ApiPropertyOptional({ description: 'Omit to keep the existing password unchanged.' })
  @IsOptional()
  @IsString()
  password?: string;
  @ApiProperty() @IsString() @MinLength(1) fromName!: string;
  @ApiProperty({ description: 'Must be on a domain verified with the provider.' }) @IsEmail() fromEmail!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() replyToEmail?: string;
  @ApiPropertyOptional({ description: 'When false, the system falls back to the SMTP_* environment variables.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestMailSettingsDto {
  @ApiProperty({ description: 'Where to send the test message.' }) @IsEmail() to!: string;
}

export class MailSettingsResponseDto {
  @ApiProperty({ description: 'False when no settings row exists — the system is using the SMTP_* env vars.' })
  configured!: boolean;
  @ApiProperty({ enum: MailProvider, nullable: true }) provider!: string | null;
  @ApiProperty({ nullable: true }) host!: string | null;
  @ApiProperty({ nullable: true }) port!: number | null;
  @ApiProperty() secure!: boolean;
  @ApiProperty({ nullable: true }) username!: string | null;
  /** Never the password itself — only whether one is stored. */
  @ApiProperty({ description: 'Whether a password is stored. The value itself is never returned.' })
  hasPassword!: boolean;
  @ApiProperty({ nullable: true }) fromName!: string | null;
  @ApiProperty({ nullable: true }) fromEmail!: string | null;
  @ApiProperty({ nullable: true }) replyToEmail!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) lastTestedAt!: Date | null;
  @ApiProperty({ nullable: true }) lastTestError!: string | null;
  @ApiProperty({ description: 'Where mail goes right now, so the UI never has to guess.' })
  effectiveTransport!: string;
}
