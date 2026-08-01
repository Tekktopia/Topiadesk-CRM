import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { DocumentCategoryResponseDto } from './dto/document-category-response.dto';

/**
 * Foundation stub. Batch 1 Agent D owns backend/api/src/modules/documents/:
 * upload/version/link to MinIO, retention policy enforcement.
 */
@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('documents')
export class DocumentsController {
  @Get('categories')
  @ApiOkResponse({ type: [DocumentCategoryResponseDto] })
  async listCategories(): Promise<DocumentCategoryResponseDto[]> {
    return getPrismaClient().documentCategory.findMany({ orderBy: { name: 'asc' } });
  }
}
