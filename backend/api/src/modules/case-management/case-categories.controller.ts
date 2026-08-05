import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CaseCategoryResponseDto, CreateCaseCategoryDto, UpdateCaseCategoryDto } from './dto/case-category.dto';

/**
 * case_categories has no RLS policy (prisma/rls/001_enable_rls.sql
 * deliberately omits it, same tier as `carriers` — open lookup/reference
 * data). Reads are therefore ungated here (authentication alone suffices,
 * matching carriers.controller.ts); writes are gated on 'case' — no
 * dedicated 'case_category' permission resource is seeded, mirroring how
 * carriers.controller.ts reuses 'account'.
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('case-categories')
export class CaseCategoriesController {
  @Get()
  @ApiOkResponse({ type: [CaseCategoryResponseDto] })
  async list(): Promise<CaseCategoryResponseDto[]> {
    return getPrismaClient().caseCategory.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @ApiOkResponse({ type: CaseCategoryResponseDto })
  async getOne(@Param('id') id: string): Promise<CaseCategoryResponseDto> {
    const category = await getPrismaClient().caseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('CaseCategory not found');
    return category;
  }

  @Post()
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseCategoryResponseDto })
  async create(@Body() dto: CreateCaseCategoryDto): Promise<CaseCategoryResponseDto> {
    return getPrismaClient().caseCategory.create({ data: { name: dto.name, code: dto.code, caseType: dto.caseType, parentId: dto.parentId } });
  }

  @Patch(':id')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseCategoryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCaseCategoryDto): Promise<CaseCategoryResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.caseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CaseCategory not found');
    // Full descendant-cycle prevention happens client-side (the parent
    // picker excludes the category's own descendants — see
    // case-category-form-dialog.tsx). This is the cheap backstop for the
    // one case that would otherwise silently corrupt the tree via a direct
    // API call: a category naming itself as its own parent.
    if (dto.parentId && dto.parentId === id) throw new BadRequestException('A category cannot be its own parent');
    return prisma.caseCategory.update({ where: { id }, data: { name: dto.name, code: dto.code, caseType: dto.caseType, parentId: dto.parentId } });
  }

  @Delete(':id')
  @RequirePermission('case', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.caseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CaseCategory not found');
    await prisma.caseCategory.delete({ where: { id } });
    return { deleted: true };
  }
}
