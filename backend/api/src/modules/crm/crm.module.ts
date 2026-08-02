import { Module } from '@nestjs/common';
import { AccountRelationshipsController, AccountsController } from './accounts.controller';
import { ContactsController } from './contacts.controller';
import { CarriersController } from './carriers.controller';
import { LeadsController } from './leads.controller';
import { PipelineStagesController, PipelinesController } from './pipelines.controller';
import { MarketSubmissionsController, OpportunitiesController } from './opportunities.controller';
import { ActivitiesController } from './activities.controller';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [
    AccountsController,
    AccountRelationshipsController,
    ContactsController,
    CarriersController,
    LeadsController,
    PipelinesController,
    PipelineStagesController,
    OpportunitiesController,
    MarketSubmissionsController,
    ActivitiesController,
    TasksController,
  ],
})
export class CrmModule {}
