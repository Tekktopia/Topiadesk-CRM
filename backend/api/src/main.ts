import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { loadEnv } from '@topiadesk/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const env = loadEnv();

  // rawBody: needed by webhook-receiver.controller.ts to verify a real
  // vendor HMAC signature (Paystack's x-paystack-signature, DocuSign
  // Connect's HMAC header) against the EXACT bytes sent — re-serializing
  // the already-JSON-parsed body first can differ byte-for-byte (key
  // order, whitespace) and silently break verification.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  const corsOrigins = [
    env.APP_URL,
    ...(env.CORS_ADDITIONAL_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TopiaDesk CRM API')
    .setDescription(
      'Phase 1 API — Identity/RBAC, CRM (Accounts/Leads/Opportunities), Policy lifecycle, Documents, Integrations, Notifications, AI Gateway, Dashboards.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.listen(env.API_PORT, '0.0.0.0');
}

bootstrap().catch((err) => {
   
  console.error('Fatal error during bootstrap', err);
  process.exit(1);
});
