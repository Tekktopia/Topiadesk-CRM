import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { PolicyVersionController } from './policy-version.controller';
import { PolicyPremiumController, PremiumController } from './premium.controller';
import { RenewalScheduleController } from './renewal-schedule.controller';
import { ApprovalThresholdRulesController } from './approval-threshold-rules.controller';

@Module({
  // ApprovalThresholdRulesController ('policies/approval-threshold-rules')
  // MUST precede PolicyController ('policies/:id') — Nest/Express registers
  // routes across controllers in this array's order, and PolicyController's
  // ParseUUIDPipe-guarded :id would otherwise 400 a request to this
  // literal-segment route before it ever reaches here (same precedent as
  // e.g. accounts.controller.ts's 'check-duplicates' before ':id').
  controllers: [
    ApprovalThresholdRulesController,
    PolicyController,
    PolicyVersionController,
    PolicyPremiumController,
    PremiumController,
    RenewalScheduleController,
  ],
})
export class PolicyModule {}
