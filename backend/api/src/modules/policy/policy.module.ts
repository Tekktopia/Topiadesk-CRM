import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { PolicyVersionController } from './policy-version.controller';
import { PolicyPremiumController, PremiumController } from './premium.controller';
import { RenewalScheduleController } from './renewal-schedule.controller';

@Module({
  controllers: [PolicyController, PolicyVersionController, PolicyPremiumController, PremiumController, RenewalScheduleController],
})
export class PolicyModule {}
