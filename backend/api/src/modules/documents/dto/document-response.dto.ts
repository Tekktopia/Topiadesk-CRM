import { ApiProperty } from '@nestjs/swagger';

/** Current-version metadata flattened onto the document response — storageKey/storageBucket deliberately omitted (internal detail, not needed by API consumers). */
export class DocumentVersionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() checksumSha256!: string;
  @ApiProperty({ nullable: true }) changeNote!: string | null;
  @ApiProperty() uploadedById!: string;
  @ApiProperty() createdAt!: Date;
}

export class DocumentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true }) categoryId!: string | null;
  @ApiProperty({ nullable: true }) currentVersionId!: string | null;
  @ApiProperty({ nullable: true, type: DocumentVersionSummaryDto }) currentVersion!: DocumentVersionSummaryDto | null;
  @ApiProperty() uploadedById!: string;
  @ApiProperty() isArchived!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
