import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateLossCauseCategoryDto, LossCauseCategoryResponseDto, UpdateLossCauseCategoryDto } from './dto/loss-cause-category.dto';

/**
 * loss_cause_categories has no RLS policy — open lookup/reference data,
 * same tier as `carriers`/`case_categories`. Reads ungated; writes gated on
 * 'claim' (no dedicated 'loss_cause_category' resource is seeded, mirroring
 * carriers.controller.ts reusing 'account').
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('loss-cause-categories')
export class LossCauseCategoriesController {
  @Get()
  @ApiOkResponse({ type: [LossCauseCategoryResponseDto] })
  async list(): Promise<LossCauseCategoryResponseDto[]> {
    return getPrismaClient().lossCauseCategory.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @ApiOkResponse({ type: LossCauseCategoryResponseDto })
  async getOne(@Param('id') id: string): Promise<LossCauseCategoryResponseDto> {
    const category = await getPrismaClient().lossCauseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('LossCauseCategory not found');
    return category;
  }

  @Post()
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: LossCauseCategoryResponseDto })
  async create(@Body() dto: CreateLossCauseCategoryDto): Promise<LossCauseCategoryResponseDto> {
    return getPrismaClient().lossCauseCategory.create({ data: { name: dto.name, code: dto.code, parentId: dto.parentId } });
  }

  @Patch(':id')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: LossCauseCategoryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateLossCauseCategoryDto): Promise<LossCauseCategoryResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.lossCauseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('LossCauseCategory not found');
    // See case-categories.controller.ts's update() comment — same cheap
    // self-parent backstop; full descendant-cycle prevention is client-side.
    if (dto.parentId && dto.parentId === id) throw new BadRequestException('A category cannot be its own parent');
    return prisma.lossCauseCategory.update({ where: { id }, data: { name: dto.name, code: dto.code, parentId: dto.parentId } });
  }

  @Delete(':id')
  @RequirePermission('claim', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.lossCauseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('LossCauseCategory not found');
    await prisma.lossCauseCategory.delete({ where: { id } });
    return { deleted: true };
  }
}
