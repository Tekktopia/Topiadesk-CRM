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

/**
 * `z.string().min(1).optional()` still rejects an EMPTY string — `.optional()`
 * only widens the type to permit `undefined`, it doesn't relax `.min(1)` for a
 * defined-but-empty value. That distinction is not academic: Docker Compose's
 * `${VAR}` interpolation substitutes an unset .env var with an empty string,
 * not "key absent" — so any optional secret left blank in .env would boot the
 * container with e.g. `VOYAGE_API_KEY=""` and fail `loadEnv()` outright,
 * turning "not configured yet" into a boot crash. Normalizing '' to
 * `undefined` here keeps the two cases (truly unset vs. blank-interpolated)
 * behaving identically, matching what every lazy-client caller (e.g.
 * `getAnthropicClient()`) already assumes: "falsy means not configured."
 */
const zOptionalEnvString = () =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));

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
  // Server-to-server JWKS fetch (jwks-rsa, inside JwtVerifier) must use this
  // instead of KEYCLOAK_JWKS_URI's host when running inside Docker Compose —
  // *.topiadesk.localhost only resolves via host-machine/browser DNS, not
  // Docker's embedded DNS (same reasoning as frontend/web's API_INTERNAL_URL).
  // KEYCLOAK_ISSUER_URL stays the public URL regardless, since it's also used
  // as the expected `iss` claim value, which Keycloak always stamps as the
  // public hostname (KC_HOSTNAME). Falls back to KEYCLOAK_JWKS_URI's own host
  // when unset, e.g. a real deployment where public DNS resolves everywhere.
  KEYCLOAK_INTERNAL_URL: z.string().url().optional(),
  KEYCLOAK_WEBHOOK_SECRET: z.string().min(1),

  // Shared-secret header check for the campaign-management module's
  // provider-callback routes (campaigns/webhooks/email|sms|whatsapp/events)
  // — same pattern as KEYCLOAK_WEBHOOK_SECRET, see
  // backend/api/src/modules/campaigns/campaign-webhook.guard.ts.
  CAMPAIGN_WEBHOOK_SECRET: z.string().min(1),

  // Shared-secret header check for omnichannel inbound webhooks
  // (public/webhooks/inbound-email|whatsapp|sms) — same pattern as
  // CAMPAIGN_WEBHOOK_SECRET, see
  // backend/api/src/modules/omnichannel/omnichannel-webhook.guard.ts.
  OMNICHANNEL_WEBHOOK_SECRET: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_GATEWAY_MODEL: z.string().default('claude-sonnet-5'),
  AI_ORG_MONTHLY_SPEND_CAP_USD: z.coerce.number().positive().default(500),
  AI_PER_USER_DAILY_REQUEST_CAP: z.coerce.number().int().positive().default(100),
  // Anthropic has no embeddings API — Voyage AI is Anthropic's recommended
  // embeddings partner (see ai-gateway/voyage-client.ts). Optional, same
  // lazy-client reasoning as ANTHROPIC_API_KEY: semantic search must not
  // block API boot in an environment that hasn't provisioned it yet. Uses
  // zOptionalEnvString (not `.optional()` alone) — see that helper's
  // comment for a real docker-compose footgun this avoids.
  VOYAGE_API_KEY: zOptionalEnvString(),

  // Keycloak Admin REST API service-account credentials (manage-users realm-
  // management role) for forced-logout/session-list — see identity/
  // keycloak-admin.service.ts. Deliberately a SEPARATE client from
  // KEYCLOAK_CLIENT_ID_API/KEYCLOAK_CLIENT_SECRET_API (which only ever needs
  // to verify JWTs, never call Keycloak back) so a leak of one credential
  // doesn't hand over the other's privileges. Optional/lazy for the same
  // reason as ANTHROPIC_API_KEY — force-logout is a real but non-boot-
  // critical admin feature.
  KEYCLOAK_ADMIN_CLIENT_ID: zOptionalEnvString(),
  KEYCLOAK_ADMIN_CLIENT_SECRET: zOptionalEnvString(),

  // AES-256-GCM key (32 bytes, hex-encoded = 64 chars) for app-layer
  // encryption of IntegrationOAuthCredential's stored access/refresh tokens
  // — see integrations/oauth-token-crypto.ts. Required (not optional like
  // the AI keys above): this is entirely within our own control, so unlike
  // an external vendor API key there's no legitimate "not provisioned yet"
  // state — an unset key would otherwise fail unpredictably at first OAuth
  // callback instead of at boot.
  INTEGRATION_TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'INTEGRATION_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes, e.g. `openssl rand -hex 32`)'),

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
