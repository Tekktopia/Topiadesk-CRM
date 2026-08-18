import { Module } from '@nestjs/common';
import { AccountRelationshipsController, AccountsController } from './accounts.controller';
import { CrossSellController } from './cross-sell.controller';
import { BookTransferController } from './book-transfer.controller';
import { TerritoriesController } from './territories.controller';
import { ContactsController } from './contacts.controller';
import { CarriersController } from './carriers.controller';
import { LeadsController } from './leads.controller';
import { LeadSourcesController } from './lead-sources.controller';
import { IndustriesController } from './industries.controller';
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
import { ComplianceController } from './compliance.controller';
// Re-provided directly rather than importing IntegrationsModule wholesale
// — same "stateless service, second injector instance is harmless"
// pattern integrations.module.ts's own header comment documents for
// KeycloakAdminService.
import { DojahService } from '../integrations/dojah.service';

@Module({
  controllers: [
    CrossSellController,
    BookTransferController,
    TerritoriesController,
    AccountsController,
    AccountRelationshipsController,
    ContactsController,
    CarriersController,
    LeadsController,
    LeadSourcesController,
    IndustriesController,
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
    ComplianceController,
  ],
  providers: [DojahService],
})
export class CrmModule {}
