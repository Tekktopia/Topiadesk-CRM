import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT type-only: CreateKnowledgeCategoryDto/UpdateKnowledgeCategoryDto are
// @Body() parameter types (see eslint.config.mjs's root-level CAUTION
// comment — `eslint --fix` would happily convert this to a type-only
// import, silently breaking ValidationPipe for these endpoints).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateKnowledgeCategoryDto, KnowledgeCategoryResponseDto, UpdateKnowledgeCategoryDto } from './dto/knowledge-category.dto';

/**
 * Tree structure lives entirely in parentCategoryId (self-referential FK) —
 * no separate nested-tree endpoint; clients build the tree client-side
 * from the flat list, the same shape DocumentCategory already uses (see
 * documents.controller.ts's listCategories()).
 *
 * Read endpoints carry no @RequirePermission, matching
 * `knowledge_categories_select`'s USING clause (any authenticated user).
 * Write endpoints require 'knowledge_category'/'write', matching
 * `knowledge_categories_write`'s WITH CHECK (any non-null scope — a
 * category isn't owned by a specific user the way an article is).
 */
@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('knowledge/categories')
export class KnowledgeCategoriesController {
  @Get()
  @ApiOkResponse({ type: [KnowledgeCategoryResponseDto] })
  async list(): Promise<KnowledgeCategoryResponseDto[]> {
    return getPrismaClient().knowledgeCategory.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });
  }

  @Get(':id')
  @ApiOkResponse({ type: KnowledgeCategoryResponseDto })
  async findOne(@Param('id') id: string): Promise<KnowledgeCategoryResponseDto> {
    const category = await getPrismaClient().knowledgeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Knowledge category not found');
    return category;
  }

  @Post()
  @RequirePermission('knowledge_category', 'write')
  @ApiOkResponse({ type: KnowledgeCategoryResponseDto })
  async create(@Body() dto: CreateKnowledgeCategoryDto): Promise<KnowledgeCategoryResponseDto> {
    return getPrismaClient().knowledgeCategory.create({ data: dto });
  }

  @Patch(':id')
  @RequirePermission('knowledge_category', 'write')
  @ApiOkResponse({ type: KnowledgeCategoryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateKnowledgeCategoryDto): Promise<KnowledgeCategoryResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.knowledgeCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Knowledge category not found');
    return prisma.knowledgeCategory.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('knowledge_category', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: true }> {
    try {
      await getPrismaClient().knowledgeCategory.delete({ where: { id } });
    } catch {
      // RLS hides rows outside scope the same way a genuinely-missing row
      // does — Prisma's delete throws P2025 either way; both map to 404
      // (same pattern as DocumentsService.deleteLink()).
      throw new NotFoundException('Knowledge category not found');
    }
    return { deleted: true };
  }
}
