import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { TenantsController } from './tenants.controller';
import { PlansController } from './plans.controller';

@Module({
  controllers: [PlatformController, TenantsController, PlansController],
})
export class PlatformModule {}
