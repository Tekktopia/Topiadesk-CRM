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
      )
      .forRoutes('*');
  }
}
