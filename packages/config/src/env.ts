import { z } from 'zod';

/**
 * Single source of truth for validated runtime configuration.
 * Every service (api, worker) imports `env` from here instead of touching
 * `process.env` directly — an invalid/missing var fails fast at boot, not
 * mid-request in production.
 */

/**
 * `z.coerce.boolean()` does NOT parse the string "false" as `false` — it
 * runs the input through the `Boolean()` constructor, and `Boolean('false')`
 * is `true` (any non-empty string is truthy in JS). Every boolean env var
 * below used to use `z.coerce.boolean()`, which meant `MINIO_USE_SSL=false`
 * in .env was silently parsed as `true` — caught live: the documents
 * module's MinIO S3 client tried a TLS handshake against MinIO's plain-HTTP
 * port and failed with an opaque `EPROTO ... packet length too long` error.
 * This parses '1'/'true' (case-insensitive) as true, anything else as false.
 */
const zBooleanFromEnvString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ['1', 'true'].includes(v.trim().toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WORKER_METRICS_PORT: z.coerce.number().int().positive().default(9100),

  // Postgres — runtime role only. Migrations use DIRECT_URL with the migrator role.
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  REDIS_URL: z.string().min(1),

  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: zBooleanFromEnvString(false),
  MINIO_DOCUMENTS_BUCKET: z.string().min(1),
  MINIO_AUDIT_WORM_BUCKET: z.string().min(1),
  MINIO_BACKUPS_BUCKET: z.string().min(1),
  MINIO_APP_ACCESS_KEY: z.string().min(1),
  MINIO_APP_SECRET_KEY: z.string().min(1),

  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID_API: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET_API: z.string().min(1),
  KEYCLOAK_ISSUER_URL: z.string().url(),
  KEYCLOAK_JWKS_URI: z.string().url(),
  KEYCLOAK_WEBHOOK_SECRET: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_GATEWAY_MODEL: z.string().default('claude-sonnet-5'),
  AI_ORG_MONTHLY_SPEND_CAP_USD: z.coerce.number().positive().default(500),
  AI_PER_USER_DAILY_REQUEST_CAP: z.coerce.number().int().positive().default(100),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: zBooleanFromEnvString(false),
  SMTP_FROM: z.string().min(1),

  BACKUP_CRON_SCHEDULE: z.string().default('0 */6 * * *'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  IP_WHITELIST_ENFORCED: zBooleanFromEnvString(false),
  MFA_REQUIRED_FOR_ROLES: z
    .string()
    .default('ADMIN,COMPLIANCE')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  WEB_SESSION_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validates process.env on first call and caches the result. Throws a
 * readable aggregate error (not a generic zod stack trace) so a
 * misconfigured deploy fails obviously in container logs.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only escape hatch to reset the cache between test suites. */
export function __resetEnvCacheForTests(): void {
  cached = undefined;
}
