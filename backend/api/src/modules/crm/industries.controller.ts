import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { rethrowAsHttpException } from '../identity/prisma-error.util';
import { CreateIndustryDto, IndustryQueryDto, IndustryResponseDto, UpdateIndustryDto } from './dto/industry.dto';

/**
 * industries has no RLS policy (open config tier, same as lead_sources/
 * case_categories) — reads are ungated here (authentication alone
 * suffices, powers the Account form's searchable industry picker — see
 * account-form-dialog.tsx, which previously had nowhere to look industries
 * up and used a raw UUID text input instead); writes are gated on
 * 'account', no dedicated 'industry' permission resource, mirroring
 * lead-sources.controller.ts's reuse of 'lead'.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/industries')
export class IndustriesController {
  @Get()
  @ApiOkResponse({ type: [IndustryResponseDto] })
  async list(@Query() query: IndustryQueryDto): Promise<IndustryResponseDto[]> {
    return getPrismaClient().industry.findMany({
      where: query.search ? { name: { contains: query.search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  @Get(':id')
  @ApiOkResponse({ type: IndustryResponseDto })
  async getOne(@Param('id') id: string): Promise<IndustryResponseDto> {
    const industry = await getPrismaClient().industry.findUnique({ where: { id } });
    if (!industry) throw new NotFoundException('Industry not found');
    return industry;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: IndustryResponseDto })
  async create(@Body() dto: CreateIndustryDto): Promise<IndustryResponseDto> {
    return getPrismaClient()
      .industry.create({ data: { name: dto.name, parentIndustryId: dto.parentIndustryId } })
      .catch(rethrowAsHttpException);
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: IndustryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateIndustryDto): Promise<IndustryResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.industry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Industry not found');
    return prisma.industry
      .update({ where: { id }, data: { name: dto.name, parentIndustryId: dto.parentIndustryId } })
      .catch(rethrowAsHttpException);
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.industry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Industry not found');
    // Blocked by accounts.industry_id's FK (no onDelete override -> RESTRICT)
    // if any Account still references it — surfaced as a clean 409 by
    // rethrowAsHttpException rather than a raw 500.
    await prisma.industry.delete({ where: { id } }).catch(rethrowAsHttpException);
    return { deleted: true };
  }
}
