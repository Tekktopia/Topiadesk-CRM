import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiGatewayController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AiGatewayController],
  providers: [AiGatewayService],
})
export class AiGatewayModule {}
