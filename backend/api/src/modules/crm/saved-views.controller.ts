import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma, type SavedViewEntityType } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  CreateSavedViewDto,
  RunSavedViewQueryDto,
  RunSavedViewResponseDto,
  SavedViewQueryDto,
  SavedViewResponseDto,
  UpdateSavedViewDto,
} from './dto/saved-view.dto';
import { buildSavedViewOrderBy, buildSavedViewWhere } from './saved-view-filters';
import { toOpportunityDto } from './mapping';

/**
 * saved_views_rw (prisma/rls/002_policies.sql) already restricts visibility
 * to owner/team/department/org and write to the row's own owner — no
 * dedicated 'saved_view' permission resource is seeded, so the API layer
 * reuses 'account' like carriers/pipelines/custom-field-definitions do.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/saved-views')
export class SavedViewsController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [SavedViewResponseDto] })
  async list(@Query() query: SavedViewQueryDto): Promise<SavedViewResponseDto[]> {
    return getPrismaClient().savedView.findMany({
      where: { entityType: query.entityType },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  @Get(':id')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: SavedViewResponseDto })
  async getOne(@Param('id') id: string): Promise<SavedViewResponseDto> {
    const view = await getPrismaClient().savedView.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('SavedView not found');
    return view;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: SavedViewResponseDto })
  async create(@Body() dto: CreateSavedViewDto, @CurrentUser() user: AuthenticatedUser): Promise<SavedViewResponseDto> {
    // Validate eagerly so a malformed filter/sort tree can never be saved —
    // fails at write time, not on first /run.
    await buildSavedViewWhere(dto.entityType, dto.filters);
    buildSavedViewOrderBy(dto.entityType, dto.sort);
    return getPrismaClient().savedView.create({
      data: {
        entityType: dto.entityType,
        name: dto.name,
        ownerId: user.id,
        visibility: dto.visibility,
        teamId: dto.teamId,
        filters: dto.filters as Prisma.InputJsonValue,
        sort: dto.sort as Prisma.InputJsonValue | undefined,
        columns: dto.columns ?? [],
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: SavedViewResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSavedViewDto): Promise<SavedViewResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SavedView not found');

    const entityType = existing.entityType;
    if (dto.filters !== undefined) await buildSavedViewWhere(entityType, dto.filters);
    if (dto.sort !== undefined) buildSavedViewOrderBy(entityType, dto.sort);

    return prisma.savedView.update({
      where: { id },
      data: {
        name: dto.name,
        visibility: dto.visibility,
        teamId: dto.teamId,
        filters: dto.filters as Prisma.InputJsonValue | undefined,
        sort: dto.sort as Prisma.InputJsonValue | undefined,
        columns: dto.columns,
        isDefault: dto.isDefault,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SavedView not found');
    await prisma.savedView.delete({ where: { id } });
    return { deleted: true };
  }

  @Post(':id/run')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: RunSavedViewResponseDto })
  async run(@Param('id') id: string, @Query() pageQuery: RunSavedViewQueryDto): Promise<RunSavedViewResponseDto> {
    const view = await getPrismaClient().savedView.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('SavedView not found');

    const where = await buildSavedViewWhere(view.entityType, view.filters);
    const orderBy = buildSavedViewOrderBy(view.entityType, view.sort);
    return runEntityQuery(view.entityType, where, orderBy, pageQuery.take ?? 50, pageQuery.skip ?? 0);
  }
}

async function runEntityQuery(
  entityType: SavedViewEntityType,
  where: Record<string, unknown>,
  orderByInput: Record<string, 'asc' | 'desc'>[],
  take: number,
  skip: number,
): Promise<RunSavedViewResponseDto> {
  const prisma = getPrismaClient();

  switch (entityType) {
    case 'ACCOUNT': {
      const accountWhere = where as Prisma.AccountWhereInput;
      const orderBy = orderByInput.length ? (orderByInput as Prisma.AccountOrderByWithRelationInput[]) : [{ createdAt: 'desc' as const }];
      const [rows, total] = await Promise.all([
        prisma.account.findMany({ where: accountWhere, orderBy, take, skip }),
        prisma.account.count({ where: accountWhere }),
      ]);
      return { total, rows };
    }
    case 'CONTACT': {
      const contactWhere = where as Prisma.ContactWhereInput;
      const orderBy = orderByInput.length ? (orderByInput as Prisma.ContactOrderByWithRelationInput[]) : [{ createdAt: 'desc' as const }];
      const [rows, total] = await Promise.all([
        prisma.contact.findMany({ where: contactWhere, orderBy, take, skip }),
        prisma.contact.count({ where: contactWhere }),
      ]);
      return { total, rows };
    }
    case 'LEAD': {
      const leadWhere = where as Prisma.LeadWhereInput;
      const orderBy = orderByInput.length ? (orderByInput as Prisma.LeadOrderByWithRelationInput[]) : [{ createdAt: 'desc' as const }];
      const [rows, total] = await Promise.all([
        prisma.lead.findMany({ where: leadWhere, orderBy, take, skip }),
        prisma.lead.count({ where: leadWhere }),
      ]);
      return { total, rows };
    }
    case 'OPPORTUNITY': {
      const opportunityWhere = where as Prisma.OpportunityWhereInput;
      const orderBy = orderByInput.length ? (orderByInput as Prisma.OpportunityOrderByWithRelationInput[]) : [{ createdAt: 'desc' as const }];
      const [rows, total] = await Promise.all([
        prisma.opportunity.findMany({ where: opportunityWhere, orderBy, take, skip }),
        prisma.opportunity.count({ where: opportunityWhere }),
      ]);
      return { total, rows: rows.map(toOpportunityDto) };
    }
    case 'TASK': {
      const taskWhere = where as Prisma.TaskWhereInput;
      const orderBy = orderByInput.length ? (orderByInput as Prisma.TaskOrderByWithRelationInput[]) : [{ dueDate: 'asc' as const }];
      const [rows, total] = await Promise.all([
        prisma.task.findMany({ where: taskWhere, orderBy, take, skip }),
        prisma.task.count({ where: taskWhere }),
      ]);
      return { total, rows };
    }
  }
}
