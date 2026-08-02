import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateContactDto {
  // Exactly one of accountId/carrierId must be set (contacts_exactly_one_parent
  // CHECK constraint) — validated explicitly in the controller for a clean 400
  // instead of surfacing the raw Postgres constraint violation.
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() carrierId?: string;
  @ApiProperty() @IsString() @MinLength(1) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) lastName!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isPrimary?: boolean;
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
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) title!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() createdAt!: Date;
}
