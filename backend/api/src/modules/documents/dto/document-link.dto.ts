import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
// DocumentEntityType is used as a runtime value below (@IsEnum(...) reads
// the enum's members at decoration time), so this import is already a real
// value import by nature — the CreateDocumentLinkDto *class* is the one
// that needs the value-import discipline documented in
// ai-gateway/dto/summarize-request.dto.ts, since it's imported into
// documents.controller.ts purely as a @Body() parameter type.
import { DocumentEntityType } from '@topiadesk/db';

export class CreateDocumentLinkDto {
  @ApiProperty({ enum: DocumentEntityType }) @IsEnum(DocumentEntityType) entityType!: DocumentEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
}

export class DocumentLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty({ enum: DocumentEntityType }) entityType!: DocumentEntityType;
  @ApiProperty() entityId!: string;
  @ApiProperty() linkedById!: string;
  @ApiProperty() linkedAt!: Date;
}
