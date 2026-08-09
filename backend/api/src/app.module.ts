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
import { IpWhitelistGuard } from './modules/identity/ip-whitelist.guard';
import { PortalModule } from './modules/portal/portal.module';
import { SupportModule } from './modules/support/support.module';
import { PortalContextMiddleware } from './modules/portal/portal-context.middleware';
import { PortalController } from './modules/portal/portal.controller';
import { PlatformModule } from './modules/platform/platform.module';
import { PlatformContextMiddleware } from './modules/platform/platform-context.middleware';
import { PlatformController } from './modules/platform/platform.controller';
import { TenantsController } from './modules/platform/tenants.controller';
import { PlansController } from './modules/platform/plans.controller';
import { PlatformAdminsController } from './modules/platform/platform-admins.controller';
import { TenantUsersController } from './modules/platform/tenant-users.controller';
import { PlatformSupportTicketsController } from './modules/platform/support-tickets.controller';
import { PlatformAuditLogController } from './modules/platform/platform-audit-log.controller';
import { PlatformNotificationsController } from './modules/platform/notifications.controller';
import { PlatformSearchController } from './modules/platform/platform-search.controller';

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
    PortalModule,
    PlatformModule,
    SupportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Enforcement layer for the already-existing IpWhitelistEntry CRUD API
    // (ip-whitelist.controller.ts) — see ip-whitelist.guard.ts's own header
    // comment. No-ops entirely while IP_WHITELIST_ENFORCED is unset/false
    // (today's default), so registering it here is safe regardless of
    // whether an operator has opted in yet.
    { provide: APP_GUARD, useClass: IpWhitelistGuard },
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
        // SCIM 2.0 provisioning (scim.controller.ts) — the caller is an
        // external IdP/provisioning tool presenting a ScimApiToken bearer
        // token, not a TopiaDesk-issued Keycloak JWT; independently secured
        // by ScimAuthGuard instead. Found missing here via live testing: its
        // absence meant this middleware rejected every SCIM request with
        // "Invalid or expired token" (failed JWT verification on a token
        // that was never a JWT) before ScimAuthGuard ever ran — the entire
        // SCIM API was unreachable despite scim.controller.ts's own header
        // comment claiming this exclusion already existed.
        { path: 'scim/v2/(.*)', method: RequestMethod.ALL },
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
        // Subdomain -> Keycloak realm lookup, called by frontend/web BEFORE
        // a visitor has logged in (no TopiaDesk-issued JWT could exist
        // yet). See public-tenant-lookup.controller.ts's header comment.
        { path: 'public/tenant-lookup', method: RequestMethod.GET },
        // Customer portal — external Contacts, never a Keycloak bearer
        // token. PortalContextMiddleware (registered below) is this
        // surface's own equivalent, applied to portal/* except portal/auth/*
        // (no session exists yet when requesting/consuming a login link).
        { path: 'portal/(.*)', method: RequestMethod.ALL },
        // Platform-Admin API — authenticated against the completely
        // separate "topiadesk-platform" Keycloak realm, never a tenant
        // realm. PlatformContextMiddleware (registered below) is this
        // surface's own equivalent, applied only to PlatformModule's
        // controllers.
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        // Integrations OAuth callback and inbound connector webhooks — both
        // already carried a header comment on their own controllers
        // claiming this exclusion existed, but it was never actually added
        // here (found live: every external OAuth redirect / connector
        // webhook POST 401'd from this middleware before ever reaching
        // oauth.controller.ts / webhook-receiver.controller.ts). The
        // OAuth callback is secured by its own signed `state` param
        // (oauth-connector.service.ts); the webhook receiver is secured by
        // a per-connector shared secret (config.webhookSecret) checked
        // inside the controller itself — neither presents a TopiaDesk-
        // issued Keycloak JWT, same reasoning as every other exclusion
        // above.
        { path: 'integrations/oauth/:connectorId/callback', method: RequestMethod.GET },
        { path: 'integrations/webhooks/:webhookPath', method: RequestMethod.POST },
      )
      .forRoutes('*');

    // Targets the PortalController class directly rather than a
    // 'portal/(.*)' string pattern — empirically, forRoutes() with that
    // regex-style string silently matched nothing in this NestJS version
    // (unlike RlsContextMiddleware's .exclude() above, where the identical
    // pattern does work — exclude() and forRoutes() apparently don't share
    // matching behavior here), caught via live testing: every /portal/*
    // data endpoint 500'd with req.portalContext unset. PortalAuthController
    // (request-link/consume/logout) is a separate controller class never
    // targeted by this call, so no .exclude() is needed either.
    consumer.apply(PortalContextMiddleware).forRoutes(PortalController);

    // Targets the controller classes directly, not a 'platform/(.*)'
    // string pattern — see PortalContextMiddleware's registration above for
    // why: forRoutes() with that regex-style string was found to silently
    // match nothing in this NestJS version even though .exclude() with the
    // identical pattern does work.
    consumer
      .apply(PlatformContextMiddleware)
      .forRoutes(
        PlatformController,
        TenantsController,
        PlansController,
        PlatformAdminsController,
        TenantUsersController,
        PlatformSupportTicketsController,
        PlatformAuditLogController,
        PlatformNotificationsController,
        PlatformSearchController,
      );
  }
}
