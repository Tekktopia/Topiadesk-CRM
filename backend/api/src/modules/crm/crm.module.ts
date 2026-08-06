import { Module } from '@nestjs/common';
import { AccountRelationshipsController, AccountsController } from './accounts.controller';
import { ContactsController } from './contacts.controller';
import { CarriersController } from './carriers.controller';
import { LeadsController } from './leads.controller';
import { PipelineStagesController, PipelinesController } from './pipelines.controller';
import { MarketSubmissionsController, OpportunitiesController } from './opportunities.controller';
import { ActivitiesController } from './activities.controller';
import { TasksController } from './tasks.controller';
import { CustomFieldDefinitionsController } from './custom-field-definitions.controller';
import { SavedViewsController } from './saved-views.controller';
import { SalesQuotasController } from './sales-quotas.controller';
import { AutomationRulesController } from './automation-rules.controller';
import { SitesController } from './sites.controller';

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
    CustomFieldDefinitionsController,
    SavedViewsController,
    SalesQuotasController,
    AutomationRulesController,
    SitesController,
  ],
})
export class CrmModule {}
