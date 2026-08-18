import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
  PipelineUsageResponseDto,
  ReorderPipelineStagesDto,
  UpdatePipelineDto,
  UpdatePipelineStageDto,
} from './dto/pipeline.dto';
import { BASE_CURRENCY, loadExchangeRates, toBaseCurrency } from '../dashboards/currency.util';

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

  /**
   * Per-stage deal counts and value, so the setup page can show what a
   * config change would affect BEFORE it is attempted. See
   * PipelineUsageResponseDto for why this is not optional nicety.
   */
  @Get(':id/usage')
  @ApiOkResponse({ type: PipelineUsageResponseDto })
  async usage(@Param('id') id: string): Promise<PipelineUsageResponseDto> {
    const prisma = getPrismaClient();
    const pipeline = await prisma.pipeline.findUnique({
      where: { id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const stageIds = pipeline.stages.map((s) => s.id);
    const [opportunities, exchangeRates] = await Promise.all([
      stageIds.length === 0
        ? Promise.resolve([])
        : prisma.opportunity.findMany({
            where: { pipelineStageId: { in: stageIds } },
            select: { pipelineStageId: true, amount: true, currency: true },
          }),
      loadExchangeRates(),
    ]);

    const countByStage = new Map<string, number>();
    const valueByStage = new Map<string, number>();
    for (const opp of opportunities) {
      const base = toBaseCurrency(Number(opp.amount), opp.currency, exchangeRates);
      countByStage.set(opp.pipelineStageId, (countByStage.get(opp.pipelineStageId) ?? 0) + 1);
      valueByStage.set(opp.pipelineStageId, (valueByStage.get(opp.pipelineStageId) ?? 0) + base);
    }

    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const stages = pipeline.stages.map((s) => ({
      stageId: s.id,
      stageName: s.name,
      opportunityCount: countByStage.get(s.id) ?? 0,
      openValue: round2(valueByStage.get(s.id) ?? 0),
    }));

    return {
      pipelineId: id,
      baseCurrency: BASE_CURRENCY,
      totalOpportunities: opportunities.length,
      totalValue: round2(stages.reduce((sum, s) => sum + s.openValue, 0)),
      stages,
    };
  }

  @Delete(':id')
  @RequirePermission('opportunity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.pipeline.findUnique({ where: { id }, include: { stages: { select: { id: true } } } });
    if (!existing) throw new NotFoundException('Pipeline not found');

    // Pipeline -> stages is ON DELETE CASCADE, but stage -> opportunities is
    // ON DELETE RESTRICT, so deleting a pipeline that still holds deals fails
    // deep inside the cascade with a raw Postgres FK error and surfaces to the
    // admin as an opaque 500. Verified against the live schema. Check first
    // and say exactly what is in the way.
    const stageIds = existing.stages.map((s) => s.id);
    if (stageIds.length > 0) {
      const blocking = await prisma.opportunity.count({ where: { pipelineStageId: { in: stageIds } } });
      if (blocking > 0) {
        throw new ConflictException(
          `Cannot delete this pipeline: ${blocking} opportunit${blocking === 1 ? 'y is' : 'ies are'} still in its stages. Move or close them first.`,
        );
      }
    }

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

  /**
   * Re-sequences every stage of one pipeline to match `stageIds`' order
   * (0-indexed) — the only way to move a stage without hand-computing a
   * collision-free `order` value yourself, since (pipelineId, order) is a
   * DB-level unique constraint. Two-phase within one transaction: first
   * bump every stage's order into a disjoint high range (+1000), then set
   * final 0..n-1 values — the intermediate range can never collide with
   * either the old or new values because pipelines don't have anywhere
   * near 1000 stages.
   */
  @Post(':id/stages/reorder')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: [PipelineStageResponseDto] })
  async reorderStages(@Param('id') id: string, @Body() dto: ReorderPipelineStagesDto): Promise<PipelineStageResponseDto[]> {
    const prisma = getPrismaClient();
    const pipeline = await prisma.pipeline.findUnique({ where: { id }, include: { stages: true } });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    const existingIds = new Set(pipeline.stages.map((s) => s.id));
    if (dto.stageIds.length !== pipeline.stages.length || !dto.stageIds.every((sid) => existingIds.has(sid))) {
      throw new NotFoundException('stageIds must be exactly the set of this pipeline’s current stage ids');
    }

    return prisma.$transaction(async (tx) => {
      await Promise.all(dto.stageIds.map((stageId, index) => tx.pipelineStage.update({ where: { id: stageId }, data: { order: index + 1000 } })));
      await Promise.all(dto.stageIds.map((stageId, index) => tx.pipelineStage.update({ where: { id: stageId }, data: { order: index } })));
      return tx.pipelineStage.findMany({ where: { pipelineId: id }, orderBy: { order: 'asc' } });
    });
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

    // opportunities.pipeline_stage_id is ON DELETE RESTRICT — without this
    // check Postgres rejects the delete and the admin sees a 500 with no
    // indication that deals are the reason. A 409 naming the count is both
    // actionable and the correct status for "the request conflicts with
    // current state".
    const blocking = await prisma.opportunity.count({ where: { pipelineStageId: id } });
    if (blocking > 0) {
      throw new ConflictException(
        `Cannot delete stage "${existing.name}": ${blocking} opportunit${blocking === 1 ? 'y is' : 'ies are'} still in it. Move them to another stage first.`,
      );
    }

    await prisma.pipelineStage.delete({ where: { id } });
    return { deleted: true };
  }
}
