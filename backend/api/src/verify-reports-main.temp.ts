/**
 * TEMPORARY verification-only entrypoint — not imported by main.ts or
 * app.module.ts, not part of the real app. Composes the same middleware/
 * pipe wiring as main.ts + app.module.ts but with ReportsModule included
 * (app.module.ts itself is intentionally NOT touched — that wiring is left
 * for whoever integrates all parallel agents' modules, per this task's
 * explicit constraint). Used only to empirically verify
 * ReportsController/ScheduledReportsController end-to-end against the live
 * stack; deleted after verification, never committed.
 */
import 'reflect-metadata';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from '@topiadesk/config';
import { AppConfigModule, ENV_TOKEN, type Env } from './common/config/config.module';
import { RlsContextMiddleware } from './common/auth/rls-context.middleware';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV_TOKEN],
      useFactory: (env: Env) => ({ pinoHttp: { level: env.LOG_LEVEL } }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ReportsModule,
    DashboardsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class VerifyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RlsContextMiddleware).exclude({ path: 'health', method: RequestMethod.GET }).forRoutes('*');
  }
}

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(VerifyModule, { bufferLogs: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.listen(env.API_PORT, '0.0.0.0');
  console.log(`[verify] listening on :${env.API_PORT}`);
}

bootstrap().catch((err) => {
  console.error('[verify] fatal', err);
  process.exit(1);
});
