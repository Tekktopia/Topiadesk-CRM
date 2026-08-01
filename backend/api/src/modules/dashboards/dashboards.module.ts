import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';

@Module({
  controllers: [DashboardsController],
})
export class DashboardsModule {}
