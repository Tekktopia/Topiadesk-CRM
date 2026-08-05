import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { RoleDashboardsController } from './role-dashboards.controller';

@Module({
  controllers: [DashboardsController, RoleDashboardsController],
})
export class DashboardsModule {}
