import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { buildDefaultRegistry, computeNextRunAt, getReportDownloadUrl } from '@topiadesk/reports';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  CreateScheduledReportDto,
  ScheduledReportResponseDto,
  ScheduledReportRunDownloadResponseDto,
  ScheduledReportRunResponseDto,
  UpdateScheduledReportDto,
} from './dto/scheduled-report.dto';
import { enqueueScheduledReportGenerate } from './scheduled-report-generate-queue';

const registry = buildDefaultRegistry();

type ScheduledReportWithRecipients = Prisma.ScheduledReportGetPayload<{ include: { recipients: true } }>;

/**
 * `scheduled_report_runs`/`scheduled_report_deliveries` are deliberately
 * NOT audit-chained (operational logs, same tier as sync_jobs/
 * integration_logs) — confirmed against prisma/triggers/002_audit_chain_
 * triggers.sql, no special handling needed here beyond what RLS already
 * enforces.
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('scheduled-reports')
export class ScheduledReportsController {
  @Get()
  @RequirePermission('scheduled_report', 'read')
  @ApiOkResponse({ type: [ScheduledReportResponseDto] })
  async list(): Promise<ScheduledReportResponseDto[]> {
    const reports = await getPrismaClient().scheduledReport.findMany({
      include: { recipients: true },
      orderBy: { createdAt: 'desc' },
    });
    return reports.map(toScheduledReportResponseDto);
  }

  @Post()
  @RequirePermission('scheduled_report', 'write')
  @ApiOkResponse({ type: ScheduledReportResponseDto })
  async create(@Body() dto: CreateScheduledReportDto, @CurrentUser() user: AuthenticatedUser): Promise<ScheduledReportResponseDto> {
    const definition = registry.get(dto.reportKey);
    if (!definition) throw new NotFoundException(`Unknown report key: ${dto.reportKey}`);
    const filters = this.validateFilters(definition, dto.filters);
    this.validateDimension(definition, dto.dimension);

    const hourOfDayUtc = dto.hourOfDayUtc ?? 6;
    const nextRunAt = computeNextRunAt(dto.frequency, dto.dayOfWeek ?? null, dto.dayOfMonth ?? null, hourOfDayUtc, new Date());

    const prisma = getPrismaClient();
    const report = await prisma.scheduledReport.create({
      data: {
        name: dto.name,
        reportKey: dto.reportKey,
        filters: filters as Prisma.InputJsonValue,
        dimension: dto.dimension,
        format: dto.format,
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        hourOfDayUtc,
        ownerId: user.id,
        nextRunAt,
      },
    });

    // Sequential writes with manual compensation, not
    // getPrismaClient().$transaction() — see leads.controller.ts's
    // convert() for the exact reasoning this module was told to follow.
    try {
      for (const recipient of dto.recipients) {
        if (recipient.channel !== 'WEBHOOK' && !recipient.userId) {
          throw new BadRequestException(`recipient with channel ${recipient.channel} requires userId`);
        }
        if (recipient.channel === 'WEBHOOK' && !recipient.webhookUrl) {
          throw new BadRequestException('recipient with channel WEBHOOK requires webhookUrl');
        }
        await prisma.scheduledReportRecipient.create({
          data: {
            scheduledReportId: report.id,
            userId: recipient.userId,
            channel: recipient.channel,
            webhookUrl: recipient.webhookUrl,
          },
        });
      }
    } catch (err) {
      await prisma.scheduledReport.delete({ where: { id: report.id } }).catch(() => undefined);
      throw err;
    }

    const created = await prisma.scheduledReport.findUniqueOrThrow({ where: { id: report.id }, include: { recipients: true } });
    return toScheduledReportResponseDto(created);
  }

  @Patch(':id')
  @RequirePermission('scheduled_report', 'write')
  @ApiOkResponse({ type: ScheduledReportResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateScheduledReportDto): Promise<ScheduledReportResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Scheduled report not found');

    const reportKey = dto.reportKey ?? existing.reportKey;
    const definition = registry.get(reportKey);
    if (!definition) throw new NotFoundException(`Unknown report key: ${reportKey}`);
    const filters = dto.filters ? this.validateFilters(definition, dto.filters) : undefined;
    if (dto.dimension !== undefined) this.validateDimension(definition, dto.dimension);

    const frequency = dto.frequency ?? existing.frequency;
    const dayOfWeek = dto.dayOfWeek ?? existing.dayOfWeek;
    const dayOfMonth = dto.dayOfMonth ?? existing.dayOfMonth;
    const hourOfDayUtc = dto.hourOfDayUtc ?? existing.hourOfDayUtc;
    const scheduleShapeChanged = dto.frequency !== undefined || dto.dayOfWeek !== undefined || dto.dayOfMonth !== undefined || dto.hourOfDayUtc !== undefined;

    const updated = await prisma.scheduledReport.update({
      where: { id },
      data: {
        name: dto.name,
        reportKey: dto.reportKey,
        filters: filters as Prisma.InputJsonValue | undefined,
        dimension: dto.dimension,
        format: dto.format,
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        hourOfDayUtc: dto.hourOfDayUtc,
        isActive: dto.isActive,
        nextRunAt: scheduleShapeChanged ? computeNextRunAt(frequency, dayOfWeek, dayOfMonth, hourOfDayUtc, new Date()) : undefined,
      },
    });

    if (dto.recipients) {
      await prisma.scheduledReportRecipient.deleteMany({ where: { scheduledReportId: id } });
      for (const recipient of dto.recipients) {
        await prisma.scheduledReportRecipient.create({
          data: { scheduledReportId: id, userId: recipient.userId, channel: recipient.channel, webhookUrl: recipient.webhookUrl },
        });
      }
    }

    const result = await prisma.scheduledReport.findUniqueOrThrow({ where: { id: updated.id }, include: { recipients: true } });
    return toScheduledReportResponseDto(result);
  }

  @Delete(':id')
  @RequirePermission('scheduled_report', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Scheduled report not found');
    await prisma.scheduledReport.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Creates a run row immediately (durable — survives a Redis blip) then
   * enqueues onto the same BullMQ queue dispatch.job.ts's poll feeds, for
   * near-immediate processing instead of waiting up to ~60s for the next
   * poll tick. See scheduled-report-generate-queue.ts's header comment.
   */
  @Post(':id/run-now')
  @RequirePermission('scheduled_report', 'write')
  @ApiOkResponse({ type: ScheduledReportRunResponseDto })
  async runNow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ScheduledReportRunResponseDto> {
    const prisma = getPrismaClient();
    const report = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Scheduled report not found');

    const run = await prisma.scheduledReportRun.create({
      data: {
        scheduledReportId: report.id,
        reportKey: report.reportKey,
        filters: report.filters as Prisma.InputJsonValue,
        dimension: report.dimension,
        format: report.format,
        status: 'PENDING',
        triggeredById: user.id,
      },
    });

    await enqueueScheduledReportGenerate(run.id);
    return toScheduledReportRunResponseDto(run);
  }

  @Get(':id/runs')
  @RequirePermission('scheduled_report', 'read')
  @ApiOkResponse({ type: [ScheduledReportRunResponseDto] })
  async listRuns(@Param('id') id: string): Promise<ScheduledReportRunResponseDto[]> {
    const runs = await getPrismaClient().scheduledReportRun.findMany({
      where: { scheduledReportId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return runs.map(toScheduledReportRunResponseDto);
  }

  @Get('runs/:runId/download')
  @RequirePermission('scheduled_report', 'read')
  @ApiOkResponse({ type: ScheduledReportRunDownloadResponseDto })
  async downloadRun(@Param('runId') runId: string): Promise<ScheduledReportRunDownloadResponseDto> {
    const run = await getPrismaClient().scheduledReportRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Scheduled report run not found');
    if (run.status !== 'SUCCEEDED' || !run.storageBucket || !run.storageKey) {
      throw new BadRequestException(`Run ${runId} has no downloadable output (status: ${run.status})`);
    }
    const expiresInSeconds = 300;
    const downloadUrl = await getReportDownloadUrl(run.storageBucket, run.storageKey, expiresInSeconds);
    return { downloadUrl, expiresInSeconds };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private validateFilters(definition: { filterSchema: { safeParse: (raw: unknown) => any } }, raw: unknown): unknown {
    const parsed = definition.filterSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = (parsed.error.issues as Array<{ path: (string | number)[]; message: string }>)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid filters: ${issues}`);
    }
    return parsed.data;
  }

  private validateDimension(definition: { allowedDimensions: { key: string }[]; key: string }, dimension: string | undefined): void {
    if (dimension && !definition.allowedDimensions.some((d) => d.key === dimension)) {
      throw new BadRequestException(`Unknown dimension "${dimension}" for report "${definition.key}"`);
    }
  }
}

function toScheduledReportResponseDto(report: ScheduledReportWithRecipients): ScheduledReportResponseDto {
  return {
    id: report.id,
    name: report.name,
    reportKey: report.reportKey,
    filters: report.filters as Record<string, unknown>,
    dimension: report.dimension,
    format: report.format,
    frequency: report.frequency,
    dayOfWeek: report.dayOfWeek,
    dayOfMonth: report.dayOfMonth,
    hourOfDayUtc: report.hourOfDayUtc,
    isActive: report.isActive,
    ownerId: report.ownerId,
    nextRunAt: report.nextRunAt,
    lastRunAt: report.lastRunAt,
    recipients: report.recipients.map((r) => ({ id: r.id, userId: r.userId, channel: r.channel, webhookUrl: r.webhookUrl })),
    createdAt: report.createdAt,
  };
}

function toScheduledReportRunResponseDto(run: {
  id: string;
  scheduledReportId: string | null;
  reportKey: string;
  format: string;
  status: string;
  rowCount: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}): ScheduledReportRunResponseDto {
  return {
    id: run.id,
    scheduledReportId: run.scheduledReportId,
    reportKey: run.reportKey,
    format: run.format,
    status: run.status,
    rowCount: run.rowCount,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
  };
}

