import { Module } from '@nestjs/common';
import { CaseKpisController } from './case-kpis.controller';
import { DashboardsController } from './dashboards.controller';
import { RoleDashboardsController } from './role-dashboards.controller';
import { SavedDashboardsController } from './saved-dashboards.controller';

@Module({
  controllers: [DashboardsController, RoleDashboardsController, CaseKpisController, SavedDashboardsController],
})
export class DashboardsModule {}
