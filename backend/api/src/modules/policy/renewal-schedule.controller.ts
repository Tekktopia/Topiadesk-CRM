import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateRenewalScheduleDto, UpdateRenewalScheduleDto } from './dto/renewal-schedule.dto';
import { RenewalScheduleResponseDto } from './dto/renewal-schedule-response.dto';
import { computeInitialNextAlertDueAt } from './renewal-schedule-alert.util';

const DEFAULT_ALERT_THRESHOLDS = [90, 60, 30, 7];

/**
 * One RenewalSchedule per Policy (schema's `@unique policyId`). The
 * override surface the brief calls for lives in PATCH: reassigning
 * `assignedToId` and tuning `alertThresholds`/`renewalDueDate` — either of
 * which recomputes `nextAlertDueAt` server-side (renewal-schedule-alert.util.ts)
 * so it can never drift from what backend/worker's scan expects.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/renewal-schedule')
export class RenewalScheduleController {
  @Get()
  @RequirePermission('renewal_schedule', 'read')
  @ApiOkResponse({ type: RenewalScheduleResponseDto })
  async findOne(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<RenewalScheduleResponseDto> {
    const schedule = await getPrismaClient().renewalSchedule.findUnique({ where: { policyId } });
    if (!schedule) throw new NotFoundException('No renewal schedule for this policy');
    return schedule;
  }

  @Post()
  @RequirePermission('renewal_schedule', 'write')
  @ApiOkResponse({ type: RenewalScheduleResponseDto })
  async create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreateRenewalScheduleDto,
  ): Promise<RenewalScheduleResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

    const existing = await prisma.renewalSchedule.findUnique({ where: { policyId } });
    if (existing) throw new BadRequestException('This policy already has a renewal schedule — use PATCH to update it');

    const renewalDueDate = new Date(dto.renewalDueDate);
    const thresholds = dto.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS;

    return prisma.renewalSchedule.create({
      data: {
        policyId,
        renewalDueDate,
        alertThresholds: thresholds,
        assignedToId: dto.assignedToId,
        renewalMeetingDate: dto.renewalMeetingDate ? new Date(dto.renewalMeetingDate) : undefined,
        nextAlertDueAt: computeInitialNextAlertDueAt(renewalDueDate, thresholds),
      },
    });
  }

  @Patch()
  @RequirePermission('renewal_schedule', 'write')
  @ApiOkResponse({ type: RenewalScheduleResponseDto })
  async update(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: UpdateRenewalScheduleDto,
  ): Promise<RenewalScheduleResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.renewalSchedule.findUnique({ where: { policyId } });
    if (!existing) throw new NotFoundException('No renewal schedule for this policy');

    const renewalDueDate = dto.renewalDueDate ? new Date(dto.renewalDueDate) : existing.renewalDueDate;
    const thresholds = dto.alertThresholds ?? existing.alertThresholds;
    // Recompute nextAlertDueAt whenever either input to that computation
    // changes — an override to thresholds/renewalDueDate without this would
    // leave the worker's scan polling a stale date.
    const recomputeNextAlert = dto.renewalDueDate !== undefined || dto.alertThresholds !== undefined;

    return prisma.renewalSchedule.update({
      where: { policyId },
      data: {
        renewalDueDate: dto.renewalDueDate ? renewalDueDate : undefined,
        alertThresholds: dto.alertThresholds,
        assignedToId: dto.assignedToId,
        renewalMeetingDate: dto.renewalMeetingDate ? new Date(dto.renewalMeetingDate) : undefined,
        status: dto.status,
        nextAlertDueAt: recomputeNextAlert ? computeInitialNextAlertDueAt(renewalDueDate, thresholds) : undefined,
      },
    });
  }
}
