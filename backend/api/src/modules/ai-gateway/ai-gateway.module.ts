import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiGatewayController } from './ai-gateway.controller';
import { AiChatController } from './ai-chat.controller';
import { AiGatewayService } from './ai-gateway.service';
import { LocalEmbeddingsService } from './local/local-embeddings.service';

// LocalLlmService is deliberately NOT registered here — see its own file's
// header comment and the approved plan (distributed-kindling-cupcake.md,
// Track 1) for why: the generic pretrained LLM it served was reported live
// as making the system slow, so chat-intent-router.ts's answerKbHelp()
// reverted to a two-tier fallback that never calls it. The file stays in
// the repo as the serving harness a domain-fine-tuned replacement (Track 2
// of that plan) is meant to reuse — re-add it to this array only once that
// replacement is trained, exported, and evaluated as actually better.
@Module({
  imports: [NotificationsModule],
  controllers: [AiGatewayController, AiChatController],
  providers: [AiGatewayService, LocalEmbeddingsService],
})
export class AiGatewayModule {}
