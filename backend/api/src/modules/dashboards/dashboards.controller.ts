import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { OperationalKpiResponseDto } from './dto/operational-kpi-response.dto';

/**
 * Foundation home-screen KPI tile — every Phase-1 module needs a landing
 * view, so this is genuinely in scope now rather than deferred. The full
 * "Reporting, Analytics & AI" module (executive/technical/sales/compliance
 * dashboards, drill-down, ad-hoc report builder, export) is Phase 3 —
 * see docs/roadmap-phase2-3.md. SavedDashboard widgets must reference
 * fixed server-defined report keys with typed filters, never raw query
 * strings from the frontend — do not build a generic query builder here.
 */
@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('dashboards/operational-kpis')
export class DashboardsController {
  @Get()
  @ApiOkResponse({ type: OperationalKpiResponseDto })
  async getOperationalKpis(): Promise<OperationalKpiResponseDto> {
    const prisma = getPrismaClient();
    const in90Days = new Date();
    in90Days.setDate(in90Days.getDate() + 90);

    const [openOpportunities, renewalsDueNext90Days, activeClients] = await Promise.all([
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: false, isLost: false } },
        select: { amount: true },
      }),
      prisma.renewalSchedule.count({ where: { renewalDueDate: { lte: in90Days } } }),
      prisma.account.count({ where: { status: 'CLIENT' } }),
    ]);

    const pipelineValue = openOpportunities.reduce((sum: number, o: { amount: unknown }) => sum + Number(o.amount), 0);

    return {
      openOpportunities: openOpportunities.length,
      pipelineValue: pipelineValue.toFixed(2),
      renewalsDueNext90Days,
      activeClients,
    };
  }
}
