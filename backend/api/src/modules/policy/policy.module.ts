import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { PolicyVersionController } from './policy-version.controller';
import { PolicyPremiumController, PremiumController } from './premium.controller';
import { RenewalBoardController } from './renewal-board.controller';
import { RenewalScheduleController } from './renewal-schedule.controller';
import { ApprovalThresholdRulesController } from './approval-threshold-rules.controller';
import { PolicyProducerAssignmentController, ProducersController } from './producers.controller';
import { ProducerCommissionsController } from './producer-commissions.controller';
import { PolicyAssetController, PolicyCoverageController, PolicyParticipantController } from './policy-depth.controller';
import { SignatureRequestsController } from './signature-requests.controller';
// Re-provided directly rather than importing IntegrationsModule wholesale
// — same "stateless service, second injector instance is harmless"
// pattern integrations.module.ts's own header comment documents for
// KeycloakAdminService.
import { PaystackService } from '../integrations/paystack.service';
import { ESignatureService } from '../integrations/esignature.service';

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
    RenewalBoardController,
    PolicyProducerAssignmentController,
    ProducersController,
    ProducerCommissionsController,
    PolicyCoverageController,
    PolicyParticipantController,
    PolicyAssetController,
    SignatureRequestsController,
  ],
  providers: [PaystackService, ESignatureService],
})
export class PolicyModule {}
