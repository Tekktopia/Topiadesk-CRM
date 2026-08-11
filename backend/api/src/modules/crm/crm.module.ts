import { Module } from '@nestjs/common';
import { AccountRelationshipsController, AccountsController } from './accounts.controller';
import { ContactsController } from './contacts.controller';
import { CarriersController } from './carriers.controller';
import { LeadsController } from './leads.controller';
import { LeadSourcesController } from './lead-sources.controller';
import { PipelineStagesController, PipelinesController } from './pipelines.controller';
import { MarketSubmissionsController, OpportunitiesController } from './opportunities.controller';
import { ActivitiesController } from './activities.controller';
import { TasksController } from './tasks.controller';
import { CustomFieldDefinitionsController } from './custom-field-definitions.controller';
import { SavedViewsController } from './saved-views.controller';
import { SalesQuotasController } from './sales-quotas.controller';
import { AutomationRulesController } from './automation-rules.controller';
import { SitesController } from './sites.controller';
import { DataSubjectRequestsController } from './data-subject-requests.controller';
import { ConsentRecordsController } from './consent-records.controller';
// Re-provided directly rather than importing IntegrationsModule wholesale
// — same "stateless service, second injector instance is harmless"
// pattern integrations.module.ts's own header comment documents for
// KeycloakAdminService.
import { DojahService } from '../integrations/dojah.service';

@Module({
  controllers: [
    AccountsController,
    AccountRelationshipsController,
    ContactsController,
    CarriersController,
    LeadsController,
    LeadSourcesController,
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
    DataSubjectRequestsController,
    ConsentRecordsController,
  ],
  providers: [DojahService],
})
export class CrmModule {}
