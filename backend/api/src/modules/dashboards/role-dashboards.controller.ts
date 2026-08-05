import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type PrismaClient } from '@topiadesk/db';
import { buildDefaultRegistry, type ReportResult } from '@topiadesk/reports';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { RenderedDashboardResponseDto } from './dto/rendered-dashboard-response.dto';

const registry = buildDefaultRegistry();

interface DashboardWidgetSpec {
  id: string;
  title: string;
  reportKey: string;
  filters?: Record<string, unknown>;
  dimension?: string;
}

/**
 * /dashboards/executive, /branch-manager, /broker, /compliance — fixed,
 * literal routes (not a generic /dashboards/:id) resolving to specific
 * SEEDED SavedDashboard rows by name (see packages/db/prisma/seed.ts's
 * "role-flavored default dashboards" section). Deliberately ONE render
 * path shared by all four rather than four hand-coded aggregation
 * endpoints like operational-kpis above: each dashboard's `widgets` jsonb
 * just references registry report keys + typed filters (SavedDashboard's
 * schema.prisma doc comment's exact constraint), and rendering means
 * "look up the row, execute() each referenced report" — there is no
 * per-dashboard business logic to fork. A widget whose report key is
 * stale or whose stored filters no longer validate degrades to an
 * inline `{ error }` for that one tile rather than failing the whole
 * dashboard.
 */
@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('dashboards')
export class RoleDashboardsController {
  @Get('executive')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: RenderedDashboardResponseDto })
  executive(): Promise<RenderedDashboardResponseDto> {
    return this.renderNamedDashboard('Executive Dashboard');
  }

  @Get('branch-manager')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: RenderedDashboardResponseDto })
  branchManager(): Promise<RenderedDashboardResponseDto> {
    return this.renderNamedDashboard('Branch Manager Dashboard');
  }

  @Get('broker')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: RenderedDashboardResponseDto })
  broker(): Promise<RenderedDashboardResponseDto> {
    return this.renderNamedDashboard('Broker Dashboard');
  }

  @Get('compliance')
  @RequirePermission('report', 'read')
  @ApiOkResponse({ type: RenderedDashboardResponseDto })
  compliance(): Promise<RenderedDashboardResponseDto> {
    return this.renderNamedDashboard('Compliance Dashboard');
  }

  private async renderNamedDashboard(name: string): Promise<RenderedDashboardResponseDto> {
    const prisma = getPrismaClient();
    const dashboard = await prisma.savedDashboard.findFirst({ where: { name, visibility: 'ORG' } });
    if (!dashboard) throw new NotFoundException(`Dashboard "${name}" is not seeded on this instance`);

    const specs = Array.isArray(dashboard.widgets) ? (dashboard.widgets as unknown as DashboardWidgetSpec[]) : [];
    const widgets = await Promise.all(specs.map((spec) => this.renderWidget(prisma, spec)));

    return {
      id: dashboard.id,
      name: dashboard.name,
      layoutConfig: dashboard.layoutConfig as Record<string, unknown>,
      widgets,
    };
  }

  private async renderWidget(
    prisma: PrismaClient,
    spec: DashboardWidgetSpec,
  ): Promise<{ id: string; title: string; reportKey: string; chartType: string; result?: ReportResult; error?: string }> {
    const definition = registry.get(spec.reportKey);
    if (!definition) {
      return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType: 'table', error: `Unknown report key: ${spec.reportKey}` };
    }
    const parsed = definition.filterSchema.safeParse(spec.filters ?? {});
    if (!parsed.success) {
      return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType: definition.defaultChartType, error: 'Stored widget filters no longer validate against this report\'s filterSchema' };
    }
    try {
      const result = await definition.execute(prisma, parsed.data, spec.dimension);
      return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType: definition.defaultChartType, result };
    } catch (err) {
      return { id: spec.id, title: spec.title, reportKey: spec.reportKey, chartType: definition.defaultChartType, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
