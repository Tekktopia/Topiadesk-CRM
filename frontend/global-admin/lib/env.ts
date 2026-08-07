import { z } from 'zod';

/**
 * frontend/global-admin's own env schema — same "deliberately not
 * @topiadesk/config" reasoning as frontend/web/lib/env.ts, and the same
 * KEYCLOAK_* shape, pointed at the SEPARATE "topiadesk-platform" realm
 * (KEYCLOAK_PLATFORM_*) rather than the tenant "topiadesk" one.
 */
const globalAdminEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  GLOBAL_ADMIN_URL: z.string().url(),
  API_URL: z.string().url(),
  API_INTERNAL_URL: z.string().url().optional(),
  GLOBAL_ADMIN_PORT: z.coerce.number().int().positive().default(3010),

  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_PLATFORM_REALM: z.string().min(1),
  KEYCLOAK_PLATFORM_CLIENT_ID: z.string().min(1),
  KEYCLOAK_PLATFORM_ISSUER_URL: z.string().url(),
  KEYCLOAK_INTERNAL_URL: z.string().url().optional(),

  REDIS_URL: z.string().min(1),

  // Deliberately its OWN secret (not shared with WEB_SESSION_SECRET) —
  // a leak of one app's session-encryption key must never let an attacker
  // forge the other's cookies, especially given Global Admin's much larger
  // blast radius (every tenant, not one).
  GLOBAL_ADMIN_SESSION_SECRET: z.string().min(16),
  WEB_COOKIE_DOMAIN: z.string().min(1).optional(),
});

export type GlobalAdminEnv = z.infer<typeof globalAdminEnvSchema>;

let cached: GlobalAdminEnv | undefined;

export function getGlobalAdminEnv(source: NodeJS.ProcessEnv = process.env): GlobalAdminEnv {
  if (cached) return cached;
  const parsed = globalAdminEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid frontend/global-admin environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function __resetGlobalAdminEnvCacheForTests(): void {
  cached = undefined;
}
