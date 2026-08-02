import { ApiProperty } from '@nestjs/swagger';

/** One row of GET /documents/retention/due-for-review — listing only, no auto-action taken (see RetentionPolicy schema comment: archive/flag-for-review requires legal sign-off first). */
export class RetentionDueDocumentDto {
  @ApiProperty() documentId!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty({ nullable: true }) categoryName!: string | null;
  @ApiProperty() retentionYears!: number;
  @ApiProperty() actionOnExpiry!: string;
  @ApiProperty() documentCreatedAt!: Date;
  @ApiProperty() retentionDueAt!: Date;
}
