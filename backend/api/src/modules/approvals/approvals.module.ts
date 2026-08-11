import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalDelegationsController } from './approval-delegations.controller';

@Module({
  controllers: [ApprovalsController, ApprovalDelegationsController],
})
export class ApprovalsModule {}
