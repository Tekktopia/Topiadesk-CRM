import type { MiddlewareConsumer, NestModule} from '@nestjs/common';
import { Module, RequestMethod } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule, ENV_TOKEN, type Env } from './common/config/config.module';
import { RlsContextMiddleware } from './common/auth/rls-context.middleware';
import { HealthModule } from './common/health/health.module';
import { AuditService } from './common/audit/audit.service';
import { IdentityModule } from './modules/identity/identity.module';
import { CrmModule } from './modules/crm/crm.module';
import { PolicyModule } from './modules/policy/policy.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { AuditModule } from './modules/audit/audit.module';
import { CaseManagementModule } from './modules/case-management/case-management.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { SurveysModule } from './modules/surveys/surveys.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SearchModule } from './modules/search/search.module';
import { OmnichannelModule } from './modules/omnichannel/omnichannel.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV_TOKEN],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    HealthModule,
    // Domain modules — pre-registered here once (Phase 0 "spine") so Batch 1
    // agents never need to touch this shared file; each fills in their own
    // module directory under src/modules/.
    IdentityModule,
    CrmModule,
    PolicyModule,
    DocumentsModule,
    IntegrationsModule,
    NotificationsModule,
    AiGatewayModule,
    DashboardsModule,
    AuditModule,
    CaseManagementModule,
    KnowledgeBaseModule,
    SurveysModule,
    CampaignsModule,
    ReportsModule,
    SearchModule,
    OmnichannelModule,
    LoyaltyModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuditService,
  ],
  exports: [AuditService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RlsContextMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
        { path: 'api/docs', method: RequestMethod.ALL },
        { path: 'api/docs-json', method: RequestMethod.GET },
        { path: 'api/docs/(.*)', method: RequestMethod.ALL },
        // Keycloak calls this directly (no TopiaDesk-issued JWT) — it's
        // independently secured by KeycloakWebhookGuard's shared-secret
        // check, not RLS context. See keycloak-webhook.controller.ts's
        // header comment for why this exclusion belongs here.
        { path: 'identity/webhooks/keycloak', method: RequestMethod.POST },
        // Public, token-verified survey response submission — the
        // respondent is an external contact, not a logged-in User. See
        // survey-responses.controller.ts's header comment.
        { path: 'surveys/responses/:id/submit', method: RequestMethod.POST },
        // Campaign provider callbacks (independently secured by
        // CampaignWebhookGuard's shared-secret check) and the public
        // unsubscribe link (signed-token verified). See
        // campaign-webhooks.controller.ts / public-unsubscribe.controller.ts.
        { path: 'campaigns/webhooks/email/events', method: RequestMethod.POST },
        { path: 'campaigns/webhooks/sms/events', method: RequestMethod.POST },
        { path: 'campaigns/webhooks/whatsapp/events', method: RequestMethod.POST },
        { path: 'public/unsubscribe', method: RequestMethod.GET },
        { path: 'public/unsubscribe', method: RequestMethod.POST },
        // Omnichannel: the live chat widget's own endpoints (anonymous
        // website visitor, no TopiaDesk session) and the inbound email/
        // WhatsApp/SMS webhooks (independently secured by
        // OmnichannelWebhookGuard's shared-secret check). See
        // omnichannel/live-chat.controller.ts's header comment — every
        // handler here binds SYSTEM_JOB_CONTEXT itself.
        { path: 'public/live-chat/sessions', method: RequestMethod.POST },
        { path: 'public/live-chat/sessions/:caseId/messages', method: RequestMethod.POST },
        { path: 'public/live-chat/sessions/:caseId/messages', method: RequestMethod.GET },
        { path: 'public/webhooks/inbound-email', method: RequestMethod.POST },
        { path: 'public/webhooks/whatsapp', method: RequestMethod.POST },
        { path: 'public/webhooks/sms', method: RequestMethod.POST },
        // Public knowledge base portal — anonymous external visitors (e.g.
        // a customer looking up a policy FAQ) reading CUSTOMER-visibility
        // PUBLISHED articles, with no TopiaDesk session at all. See
        // knowledge-base/public-knowledge.controller.ts's header comment —
        // every handler here binds SYSTEM_JOB_CONTEXT itself and explicitly
        // filters status/visibility in the Prisma query (RLS is bypassed
        // under that context, not enforced by it).
        { path: 'public/knowledge/articles', method: RequestMethod.GET },
        { path: 'public/knowledge/articles/:slug', method: RequestMethod.GET },
        { path: 'public/knowledge/categories', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
