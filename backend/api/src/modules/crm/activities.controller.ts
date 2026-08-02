import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ActivityQueryDto, ActivityResponseDto, CreateActivityDto } from './dto/activity.dto';

/**
 * Interaction/timeline log — create + list only (no update/delete: an
 * activity is a record of something that happened, not a mutable draft).
 * createdById always comes from the authenticated caller, never the request
 * body — activities_rw's WITH CHECK requires created_by_id = the acting
 * user unless the role holds ALL-scope activity:write.
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
      where: {
        accountId: query.accountId,
        opportunityId: query.opportunityId,
        leadId: query.leadId,
        policyId: query.policyId,
        type: query.type,
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
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
}
