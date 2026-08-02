import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Multipart form fields alongside the `file` part on POST /documents. */
export class UploadDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
}

/** Multipart form fields alongside the `file` part on POST /documents/:id/versions. */
export class UploadDocumentVersionDto {
  @ApiPropertyOptional() @IsOptional() changeNote?: string;
}
