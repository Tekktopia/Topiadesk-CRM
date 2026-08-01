import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from '@topiadesk/config';

export const ENV_TOKEN = 'ENV';

@Global()
@Module({
  providers: [{ provide: ENV_TOKEN, useValue: loadEnv() }],
  exports: [ENV_TOKEN],
})
export class AppConfigModule {}

export type { Env };
