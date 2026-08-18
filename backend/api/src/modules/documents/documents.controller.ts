import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, type DocumentEntityType } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { assertFileNotMalicious } from '../../common/uploads/malware-scan.util';
// NOT a type-only import: DocumentsService is constructor-injected below —
// Nest's DI resolves constructor parameter types via emitDecoratorMetadata's
// design:paramtypes, which needs the real class reference at runtime (same
// footgun documented on Reflector in permission.guard.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DocumentsService, type DocumentWithCurrentVersion } from './documents.service';
import { DocumentCategoryResponseDto } from './dto/document-category-response.dto';
// NOT type-only: both DTO classes are used as @Body() parameter types below
// (see the comment on CreateDocumentLinkDto's import further down).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UploadDocumentDto, UploadDocumentVersionDto } from './dto/upload-document.dto';
import { DocumentResponseDto } from './dto/document-response.dto';
import { BulkActionResponseDto, BulkArchiveDocumentsDto, BulkCategorizeDocumentsDto } from './dto/bulk-action.dto';
import { diffBulkIds } from './bulk-actions';
// NOT type-only imports: both DTO classes are used as @Body() parameter
// types below — NestJS's ValidationPipe needs the real class reference at
// runtime (see the comment in ai-gateway/dto/summarize-request.dto.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateDocumentLinkDto, DocumentLinkResponseDto } from './dto/document-link.dto';
import { RetentionDueDocumentDto } from './dto/retention-due-response.dto';

/**
 * Batch 1 Agent D — backend/api/src/modules/documents/: upload/version/
 * download to MinIO, DocumentLink CRUD, retention-due listing.
 *
 * Read endpoints deliberately carry no @RequirePermission — matches the
 * pre-existing `listCategories()` stub and prisma/rls/002_policies.sql's
 * `documents_select`/`document_versions_select`/`document_links_rw` USING
 * clauses, all of which are "any authenticated user", not owner/department
 * scoped. Write endpoints require 'document'/'write', matching
 * `documents_write`/`document_links_rw` WITH CHECK.
 */
@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('categories')
  @ApiOkResponse({ type: [DocumentCategoryResponseDto] })
  async listCategories(): Promise<DocumentCategoryResponseDto[]> {
    return getPrismaClient().documentCategory.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('retention/due-for-review')
  @ApiOkResponse({ type: [RetentionDueDocumentDto] })
  async retentionDueForReview(): Promise<RetentionDueDocumentDto[]> {
    return this.documents.listDueForReview();
  }

  @Get()
  @ApiOkResponse({ type: [DocumentResponseDto] })
  async list(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('entityType') entityType?: DocumentEntityType,
    @Query('entityId') entityId?: string,
  ): Promise<DocumentResponseDto[]> {
    const documents = await this.documents.list(categoryId, search, entityType, entityId);
    return documents.map(toDocumentResponseDto);
  }

  // Bulk endpoints — must precede ':id' for the same declaration-order
  // reason as 'categories'/'retention/due-for-review' above. No bulk/delete:
  // Document has no single-row delete endpoint either (isArchived is the
  // soft-delete mechanism throughout this module — see the schema comment
  // on Document.isArchived), so bulk/archive is the real equivalent.
  @Post('bulk/archive')
  @RequirePermission('document', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkArchive(@Body() dto: BulkArchiveDocumentsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.document.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((d) => d.id));
    if (matched.length > 0) {
      await prisma.document.updateMany({ where: { id: { in: matched } }, data: { isArchived: true } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/categorize')
  @RequirePermission('document', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkCategorize(@Body() dto: BulkCategorizeDocumentsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.document.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((d) => d.id));
    if (matched.length > 0) {
      await prisma.document.updateMany({ where: { id: { in: matched } }, data: { categoryId: dto.categoryId } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post()
  @RequirePermission('document', 'write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiOkResponse({ type: DocumentResponseDto })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    await assertFileNotMalicious(file.buffer, 'Document');
    const document = await this.documents.upload(file, dto.categoryId, user.id);
    return toDocumentResponseDto(document);
  }

  @Post(':id/versions')
  @RequirePermission('document', 'write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiOkResponse({ type: DocumentResponseDto })
  async addVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    await assertFileNotMalicious(file.buffer, 'Document');
    const document = await this.documents.addVersion(id, file, dto.changeNote, user.id);
    return toDocumentResponseDto(document);
  }

  @Get(':id')
  @ApiOkResponse({ type: DocumentResponseDto })
  async findOne(@Param('id') id: string): Promise<DocumentResponseDto> {
    const document = await this.documents.findOne(id);
    return toDocumentResponseDto(document);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('versionId') versionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, document, version } = await this.documents.getDownloadStream(id, versionId);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
      'Content-Length': version.sizeBytes.toString(),
    });
    return new StreamableFile(stream);
  }

  @Get(':id/links')
  @ApiOkResponse({ type: [DocumentLinkResponseDto] })
  async listLinks(@Param('id') id: string): Promise<DocumentLinkResponseDto[]> {
    return this.documents.listLinks(id);
  }

  @Post(':id/links')
  @RequirePermission('document', 'write')
  @ApiOkResponse({ type: DocumentLinkResponseDto })
  async createLink(
    @Param('id') id: string,
    @Body() dto: CreateDocumentLinkDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentLinkResponseDto> {
    return this.documents.createLink(id, dto.entityType, dto.entityId, user.id);
  }

  @Delete('links/:linkId')
  @RequirePermission('document', 'write')
  async deleteLink(@Param('linkId') linkId: string): Promise<{ deleted: true }> {
    await this.documents.deleteLink(linkId);
    return { deleted: true };
  }
}

function toDocumentResponseDto(document: DocumentWithCurrentVersion): DocumentResponseDto {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: Number(document.sizeBytes), // BigInt -> number: safe up to ~9PB, no real document approaches that
    categoryId: document.categoryId,
    currentVersionId: document.currentVersionId,
    currentVersion: document.currentVersion
      ? {
          id: document.currentVersion.id,
          versionNumber: document.currentVersion.versionNumber,
          sizeBytes: Number(document.currentVersion.sizeBytes),
          checksumSha256: document.currentVersion.checksumSha256,
          changeNote: document.currentVersion.changeNote,
          uploadedById: document.currentVersion.uploadedById,
          createdAt: document.currentVersion.createdAt,
        }
      : null,
    uploadedById: document.uploadedById,
    isArchived: document.isArchived,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    linkId: document.links?.[0]?.id,
    linkedAt: document.links?.[0]?.linkedAt,
  };
}
