import { Module } from '@nestjs/common';
import { KnowledgeCategoriesController } from './knowledge-categories.controller';
import { KnowledgeArticlesController } from './knowledge-articles.controller';
import { PublicKnowledgeController } from './public-knowledge.controller';
import { KnowledgeArticlesService } from './knowledge-articles.service';

@Module({
  // PublicKnowledgeController has no injected service — it talks to
  // Prisma directly under SYSTEM_JOB_CONTEXT, same as
  // KnowledgeCategoriesController above and the other public/* controllers
  // (public-unsubscribe.controller.ts, omnichannel/live-chat.controller.ts).
  controllers: [KnowledgeCategoriesController, KnowledgeArticlesController, PublicKnowledgeController],
  providers: [KnowledgeArticlesService],
})
export class KnowledgeBaseModule {}
