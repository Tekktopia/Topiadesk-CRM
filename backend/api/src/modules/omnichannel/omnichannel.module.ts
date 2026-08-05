import { Module } from '@nestjs/common';
import { LiveChatController } from './live-chat.controller';
import { InboundEmailController } from './inbound-email.controller';
import { InboundMessagingController } from './inbound-messaging.controller';

@Module({
  controllers: [LiveChatController, InboundEmailController, InboundMessagingController],
})
export class OmnichannelModule {}
