import { Module } from '@nestjs/common';
import { CustomReportController } from './custom-report.controller';
import { ReportsController } from './reports.controller';
import { ScheduledReportsController } from './scheduled-reports.controller';

@Module({
  controllers: [ReportsController, ScheduledReportsController, CustomReportController],
})
export class ReportsModule {}
