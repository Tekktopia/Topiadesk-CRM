import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CreateSavedDashboardDto, SavedDashboardResponseDto, UpdateSavedDashboardDto } from './dto/saved-dashboard.dto';
import { RenderedDashboardResponseDto } from './dto/rendered-dashboard-response.dto';
import { renderDashboardWidgets } from './dashboard-render.util';

/**
 * User-owned, visibility-scoped dashboards — `saved_dashboards_rw`
 * (prisma/rls/002_policies.sql) already restricts visibility to
 * owner/department/org and write to the row's own owner, mirroring
 * saved_views_rw exactly (minus the TEAM tier, which SavedDashboard has no
 * column for). No dedicated 'saved_dashboard' permission resource is
 * seeded — `report` already gates every report-reading surface in this
 * app (RoleDashboardsController's 4 named routes, ReportsController's
 * catalog/run), and every role holds it at some scope, so mutations reuse
 * it too rather than adding a new seed resource just for this: a
 * dashboard is fundamentally "your own arrangement of reports you can
 * already read."
 */
@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('saved-dashboards')
export class SavedDashboardsController {
  @Get()
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: [SavedDashboardResponseDto] })
  async list(): Promise<SavedDashboardResponseDto[]> {
    return getPrismaClient().savedDashboard.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  @Get(':id')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: SavedDashboardResponseDto })
  async getOne(@Param('id') id: string): Promise<SavedDashboardResponseDto> {
    const dashboard = await getPrismaClient().savedDashboard.findUnique({ where: { id } });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    return dashboard;
  }

  @Post()
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: SavedDashboardResponseDto })
  async create(@Body() dto: CreateSavedDashboardDto, @CurrentUser() user: AuthenticatedUser): Promise<SavedDashboardResponseDto> {
    return getPrismaClient().savedDashboard.create({
      data: {
        name: dto.name,
        ownerId: user.id,
        visibility: dto.visibility,
        widgets: dto.widgets as Prisma.InputJsonValue,
        layoutConfig: dto.layoutConfig as Prisma.InputJsonValue,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: SavedDashboardResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSavedDashboardDto): Promise<SavedDashboardResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.savedDashboard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Dashboard not found');
    return prisma.savedDashboard.update({
      where: { id },
      data: {
        name: dto.name,
        visibility: dto.visibility,
        widgets: dto.widgets as Prisma.InputJsonValue | undefined,
        layoutConfig: dto.layoutConfig as Prisma.InputJsonValue | undefined,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('report', 'read')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.savedDashboard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Dashboard not found');
    await prisma.savedDashboard.delete({ where: { id } });
    return { deleted: true };
  }

  @Get(':id/render')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: RenderedDashboardResponseDto })
  async render(@Param('id') id: string): Promise<RenderedDashboardResponseDto> {
    const prisma = getPrismaClient();
    const dashboard = await prisma.savedDashboard.findUnique({ where: { id } });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    const widgets = await renderDashboardWidgets(prisma, dashboard.widgets);
    return { id: dashboard.id, name: dashboard.name, layoutConfig: dashboard.layoutConfig as Record<string, unknown>, widgets };
  }
}
