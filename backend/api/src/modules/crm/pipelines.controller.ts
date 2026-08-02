import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  CreatePipelineDto,
  CreatePipelineStageDto,
  PipelineDetailResponseDto,
  PipelineResponseDto,
  PipelineStageResponseDto,
  UpdatePipelineDto,
  UpdatePipelineStageDto,
} from './dto/pipeline.dto';

/**
 * pipelines/pipeline_stages carry no RLS (org-wide config, like carriers) —
 * reads are ungated. Writes are "admin-ish" per the build brief, but the
 * only seeded resource names available are account/lead/opportunity/task/
 * activity (no dedicated 'pipeline' resource) — gated on 'opportunity'
 * since Pipeline/PipelineStage define the Opportunity workflow. Flagged in
 * the module report: this makes pipeline config writable by anyone with
 * opportunity:write (i.e. MANAGER/ACCOUNT_HANDLER too), not admin-only.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/pipelines')
export class PipelinesController {
  @Get()
  @ApiOkResponse({ type: [PipelineResponseDto] })
  async list(): Promise<PipelineResponseDto[]> {
    return getPrismaClient().pipeline.findMany({ orderBy: { name: 'asc' } });
  }

  @Get(':id')
  @ApiOkResponse({ type: PipelineDetailResponseDto })
  async getOne(@Param('id') id: string): Promise<PipelineDetailResponseDto> {
    const pipeline = await getPrismaClient().pipeline.findUnique({
      where: { id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }

  @Post()
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: PipelineResponseDto })
  async create(@Body() dto: CreatePipelineDto): Promise<PipelineResponseDto> {
    return getPrismaClient().pipeline.create({ data: dto });
  }

  @Patch(':id')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: PipelineResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdatePipelineDto): Promise<PipelineResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.pipeline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pipeline not found');
    return prisma.pipeline.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('opportunity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.pipeline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pipeline not found');
    await prisma.pipeline.delete({ where: { id } });
    return { deleted: true };
  }

  @Post(':id/stages')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: PipelineStageResponseDto })
  async createStage(@Param('id') id: string, @Body() dto: CreatePipelineStageDto): Promise<PipelineStageResponseDto> {
    const prisma = getPrismaClient();
    const pipeline = await prisma.pipeline.findUnique({ where: { id } });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return prisma.pipelineStage.create({ data: { ...dto, pipelineId: id } });
  }
}

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/pipeline-stages')
export class PipelineStagesController {
  @Patch(':id')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: PipelineStageResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdatePipelineStageDto): Promise<PipelineStageResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.pipelineStage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('PipelineStage not found');
    return prisma.pipelineStage.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('opportunity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.pipelineStage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('PipelineStage not found');
    await prisma.pipelineStage.delete({ where: { id } });
    return { deleted: true };
  }
}
