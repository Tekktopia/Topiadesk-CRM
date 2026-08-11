import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';
import { SignatureRequestStatus } from '@topiadesk/db';

export class CreateSignatureRequestDto {
  @ApiProperty({ description: 'A Document already linked to this policy (see DocumentLink) — its current version is what gets sent.' })
  @IsUUID()
  documentId!: string;
  @ApiProperty() @IsString() @MinLength(1) signerName!: string;
  @ApiProperty() @IsEmail() signerEmail!: string;
}

export class SignatureRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() documentVersionId!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() signerName!: string;
  @ApiProperty() signerEmail!: string;
  @ApiProperty({ enum: SignatureRequestStatus }) status!: string;
  @ApiProperty() externalEnvelopeId!: string;
  @ApiProperty() sentById!: string;
  @ApiProperty() sentAt!: Date;
  @ApiProperty({ nullable: true }) viewedAt!: Date | null;
  @ApiProperty({ nullable: true }) signedAt!: Date | null;
  @ApiProperty({ nullable: true }) declinedAt!: Date | null;
  @ApiProperty({ nullable: true }) declineReason!: string | null;
}
