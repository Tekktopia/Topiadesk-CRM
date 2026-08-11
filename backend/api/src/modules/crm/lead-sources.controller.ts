import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { rethrowAsHttpException } from '../identity/prisma-error.util';
import { CreateLeadSourceDto, LeadSourceResponseDto, UpdateLeadSourceDto } from './dto/lead-source.dto';

/**
 * lead_sources has no RLS policy (prisma/rls/001_enable_rls.sql
 * deliberately omits it, same "open config tier" as case_categories/
 * carriers) — reads are ungated here (authentication alone suffices);
 * writes are gated on 'lead', no dedicated 'lead_source' permission
 * resource seeded, mirroring case-categories.controller.ts's reuse of
 * 'case'.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/lead-sources')
export class LeadSourcesController {
  @Get()
  @ApiOkResponse({ type: [LeadSourceResponseDto] })
  async list(): Promise<LeadSourceResponseDto[]> {
    return getPrismaClient().leadSource.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  @Get(':id')
  @ApiOkResponse({ type: LeadSourceResponseDto })
  async getOne(@Param('id') id: string): Promise<LeadSourceResponseDto> {
    const source = await getPrismaClient().leadSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('LeadSource not found');
    return source;
  }

  @Post()
  @RequirePermission('lead', 'write')
  @ApiOkResponse({ type: LeadSourceResponseDto })
  async create(@Body() dto: CreateLeadSourceDto): Promise<LeadSourceResponseDto> {
    return getPrismaClient()
      .leadSource.create({ data: { name: dto.name, code: dto.code, isActive: dto.isActive, sortOrder: dto.sortOrder } })
      .catch(rethrowAsHttpException);
  }

  @Patch(':id')
  @RequirePermission('lead', 'write')
  @ApiOkResponse({ type: LeadSourceResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateLeadSourceDto): Promise<LeadSourceResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.leadSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('LeadSource not found');
    return prisma.leadSource
      .update({ where: { id }, data: { name: dto.name, isActive: dto.isActive, sortOrder: dto.sortOrder } })
      .catch(rethrowAsHttpException);
  }

  @Delete(':id')
  @RequirePermission('lead', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.leadSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('LeadSource not found');
    // Blocked by leads_source_fkey (ON DELETE RESTRICT) if any Lead still
    // references this code — surfaced as a clean 409 by rethrowAsHttpException
    // rather than a raw 500, unlike case-categories.controller.ts's
    // identical-shape delete (which leaves that P2003 uncaught).
    await prisma.leadSource.delete({ where: { id } }).catch(rethrowAsHttpException);
    return { deleted: true };
  }
}
