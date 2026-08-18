import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT type-only: ActivityQueryDto/CreateActivityDto/UpdateActivityDto are
// @Query()/@Body() parameter types, so Nest needs them as runtime values to
// resolve the metatype ValidationPipe validates against.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  ActivityQueryDto,
  ActivityResponseDto,
  ActivityStatsResponseDto,
  CreateActivityDto,
  UpdateActivityDto,
} from './dto/activity.dto';

/**
 * Interaction/timeline log.
 *
 * An activity records something that HAPPENED — it is not a mutable draft,
 * and that remains the governing rule. What the original create-and-list-only
 * design left no room for was the ordinary clerical case: a call logged
 * against the wrong client, or a mis-typed note, stayed wrong forever. So
 * correction exists now, deliberately narrow and guarded (see update() and
 * remove() below), rather than general-purpose editing.
 *
 * createdById always comes from the authenticated caller, never the request
 * body — activities_rw's WITH CHECK requires created_by_id = the acting user
 * unless the role holds ALL-scope activity:write.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/activities')
export class ActivitiesController {
  @Get()
  @RequirePermission('activity', 'read')
  @ApiOkResponse({ type: [ActivityResponseDto] })
  async list(@Query() query: ActivityQueryDto): Promise<ActivityResponseDto[]> {
    return getPrismaClient().activity.findMany({
      where: activityListWhere(query),
      orderBy: { occurredAt: 'desc' },
      take: query.take ?? 100,
      skip: query.skip ?? 0,
    });
  }

  /** Real total past the page cap. Must precede ':id'. */
  @Get('count')
  @RequirePermission('activity', 'read')
  @ApiOkResponse({ type: Number })
  async count(@Query() query: ActivityQueryDto): Promise<{ count: number }> {
    const count = await getPrismaClient().activity.count({ where: activityListWhere(query) });
    return { count };
  }

  /**
   * Team-activity aggregates over the same filter as the list. Must precede
   * ':id' — Nest matches literal segments in declaration order.
   */
  @Get('stats')
  @RequirePermission('activity', 'read')
  @ApiOkResponse({ type: ActivityStatsResponseDto })
  async stats(@Query() query: ActivityQueryDto): Promise<ActivityStatsResponseDto> {
    const prisma = getPrismaClient();
    const where = activityListWhere(query);

    // AND, never a spread-and-override: `{ ...where, direction: 'INBOUND' }`
    // would REPLACE a direction the caller already filtered on, so a filtered
    // view would report counts drawn from outside its own filter.
    const and = (extra: Prisma.ActivityWhereInput): Prisma.ActivityWhereInput => ({ AND: [where, extra] });

    const [total, inbound, outbound, systemLogged, byUser, byAccount] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.count({ where: and({ direction: 'INBOUND' }) }),
      prisma.activity.count({ where: and({ direction: 'OUTBOUND' }) }),
      // Integration-written rows carry no human author — counting them apart
      // keeps "how much did the team actually do" honest.
      prisma.activity.count({ where: and({ createdById: null }) }),
      prisma.activity.groupBy({ by: ['createdById'], where, _count: { _all: true } }),
      prisma.activity.groupBy({ by: ['accountId'], where, _count: { _all: true } }),
    ]);

    return {
      total,
      inbound,
      outbound,
      loggedByPeople: byUser.filter((r) => r.createdById !== null).length,
      accountsTouched: byAccount.filter((r) => r.accountId !== null).length,
      systemLogged,
    };
  }

  @Get(':id')
  @RequirePermission('activity', 'read')
  @ApiOkResponse({ type: ActivityResponseDto })
  async getOne(@Param('id') id: string): Promise<ActivityResponseDto> {
    const activity = await getPrismaClient().activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  @Post()
  @RequirePermission('activity', 'write')
  @ApiOkResponse({ type: ActivityResponseDto })
  async create(@Body() dto: CreateActivityDto, @CurrentUser() user: AuthenticatedUser): Promise<ActivityResponseDto> {
    return getPrismaClient().activity.create({
      data: {
        accountId: dto.accountId,
        contactId: dto.contactId,
        leadId: dto.leadId,
        opportunityId: dto.opportunityId,
        policyId: dto.policyId,
        type: dto.type,
        direction: dto.direction,
        subject: dto.subject,
        body: dto.body,
        occurredAt: new Date(dto.occurredAt),
        createdById: user.id,
        durationMinutes: dto.durationMinutes,
        outcome: dto.outcome,
      },
    });
  }

  /**
   * Correct a mis-logged activity — re-link it to the right record, fix the
   * note, the date, the outcome. `type` and `direction` are NOT in
   * UpdateActivityDto on purpose: an OUTBOUND email activity is what
   * satisfies a Case's FIRST_RESPONSE SLA clock, so flipping either after
   * the fact would silently rewrite SLA history.
   *
   * A transmitted email is not correctable at all — see assertCorrectable.
   */
  @Patch(':id')
  @RequirePermission('activity', 'write')
  @ApiOkResponse({ type: ActivityResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateActivityDto): Promise<ActivityResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Activity not found');
    assertCorrectable(existing);

    return prisma.activity.update({
      where: { id },
      data: {
        accountId: dto.accountId,
        contactId: dto.contactId,
        leadId: dto.leadId,
        opportunityId: dto.opportunityId,
        policyId: dto.policyId,
        subject: dto.subject,
        body: dto.body,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        outcome: dto.outcome,
        durationMinutes: dto.durationMinutes,
      },
    });
  }

  /**
   * Remove an activity logged in error.
   *
   * RLS already decides WHICH activities the caller can see at all; this adds
   * the correctness guard on top. Deleting is genuinely destructive here
   * because activities are the evidence trail behind SLA timings and email
   * threading, which is why a transmitted message can never be deleted.
   */
  @Delete(':id')
  @RequirePermission('activity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Activity not found');
    assertCorrectable(existing);
    await prisma.activity.delete({ where: { id } });
    return { deleted: true };
  }
}

/**
 * A real transmitted message is not a clerical record and must not be
 * rewritten or removed.
 *
 * `externalMessageId` is set only once a message has actually gone over the
 * wire (outbound send) or arrived from outside (inbound email/WhatsApp), and
 * it is the key the inbound pipeline threads replies on. Editing or deleting
 * such a row would break threading for every subsequent reply and would
 * falsify the record of what was genuinely sent to a customer — the opposite
 * of the clerical correction this endpoint exists to allow.
 */
function assertCorrectable(activity: { externalMessageId: string | null }): void {
  if (activity.externalMessageId) {
    throw new ForbiddenException(
      'This activity is a transmitted message, not a manual log entry — it cannot be edited or deleted. Log a correcting note against the same record instead.',
    );
  }
}

/** Shared by list/count/stats so the header always describes the rows beneath it. */
function activityListWhere(query: ActivityQueryDto): Prisma.ActivityWhereInput {
  const q = query.q?.trim();
  const hasDateBand = Boolean(query.occurredFrom || query.occurredTo);
  return {
    accountId: query.accountId,
    opportunityId: query.opportunityId,
    leadId: query.leadId,
    policyId: query.policyId,
    contactId: query.contactId,
    caseId: query.caseId,
    claimId: query.claimId,
    createdById: query.createdById,
    type: query.type,
    direction: query.direction,
    occurredAt: hasDateBand
      ? {
          gte: query.occurredFrom ? new Date(query.occurredFrom) : undefined,
          lte: query.occurredTo ? new Date(query.occurredTo) : undefined,
        }
      : undefined,
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' as const } },
            { body: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}
