import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { CasesController } from './cases.controller';
import { SlaPoliciesController } from './sla-policies.controller';
import { BusinessHoursController } from './business-hours.controller';
import { MacrosController } from './macros.controller';
import { AssignmentRulesController } from './assignment-rules.controller';
import { AgentSkillsController } from './agent-skills.controller';
import { CaseCategoriesController } from './case-categories.controller';
import { LossCauseCategoriesController } from './loss-cause-categories.controller';
import { AutomationRunStatesController } from './automation-run-states.controller';
import { BusinessRulesController } from './business-rules.controller';
import { CommentsService } from './comments.service';
import { WatchersService } from './watchers.service';
import { MacrosService } from './macros.service';

/**
 * Case Management: Claims, Cases, the SLA engine's config surface, Macros,
 * and assignment automation — see prisma/schema.prisma's "Phase 2 — Case
 * Management" section and prisma/rls/002_policies.sql's "Phase 2 — Case
 * management" block for the data model and visibility rules this module is
 * built against. Not wired into app.module.ts here — app.module.ts is a
 * shared spine file another agent wires in after all Phase 2 modules land;
 * see the module report for the exact import/registration line needed.
 */
@Module({
  controllers: [
    ClaimsController,
    CasesController,
    SlaPoliciesController,
    BusinessHoursController,
    MacrosController,
    AssignmentRulesController,
    AgentSkillsController,
    CaseCategoriesController,
    LossCauseCategoriesController,
    AutomationRunStatesController,
    BusinessRulesController,
  ],
  providers: [CommentsService, WatchersService, MacrosService],
})
export class CaseManagementModule {}
