import { Module } from '@nestjs/common';
import { AiGatewayController } from './ai-gateway.controller';

@Module({
  controllers: [AiGatewayController],
})
export class AiGatewayModule {}
