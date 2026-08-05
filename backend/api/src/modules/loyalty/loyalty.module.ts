import { Module } from '@nestjs/common';
import { LoyaltyAccountsController } from './loyalty-accounts.controller';

/**
 * Phase 2 — Customer Loyalty (docs/roadmap-phase2-3.md). LoyaltyAccount/
 * LoyaltyTransaction — see prisma/schema.prisma's "Phase 2 — Customer
 * Loyalty" section and prisma/rls/002_policies.sql's matching block.
 */
@Module({
  controllers: [LoyaltyAccountsController],
})
export class LoyaltyModule {}
