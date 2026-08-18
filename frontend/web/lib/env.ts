import { z } from 'zod';

/**
 * frontend/web's own env schema — deliberately NOT importing `loadEnv` from
 * `@topiadesk/config`: that package's schema requires backend-only vars
 * (DATABASE_URL, MINIO_*, SMTP_*, ...) that a frontend
 * process has no business needing just to boot, and would make
 * `pnpm --filter @topiadesk/web dev` fail without a fully populated root
 * `.env`. This mirrors only the vars frontend/web actually reads (all sourced
 * from the same authoritative `.env.example` at the repo root).
 *
 * Parsing is exposed as a function (`getWebEnv()`), never evaluated at
 * module scope, and called only from request-time code (route handlers,
 * middleware, server actions) — never from a Server Component reachable by
 * `next build`'s static prerender pass. That keeps `next build` green with
 * zero env vars set, per the Phase-0 requirement that the production build
 * must not require live services.
 */
const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  // Server-to-server calls (Route Handlers/Server Actions calling backend/api)
  // must use this instead of API_URL when running inside Docker Compose:
  // *.topiadesk.localhost only resolves via host-machine/browser DNS, not
  // Docker's embedded DNS, so the Next.js server reaches the API by
  // container/service name instead. Falls back to API_URL for standalone
  // `pnpm --filter @topiadesk/web dev` against a locally-run API. See
  // `lib/api/server-fetch.ts`.
  API_INTERNAL_URL: z.string().url().optional(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),

  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID_WEB: z.string().min(1),
  KEYCLOAK_ISSUER_URL: z.string().url(),
  // Same reasoning as API_INTERNAL_URL above, applied to Keycloak: discovery
  // and token-exchange calls happen server-side (Route Handlers), so they
  // must reach Keycloak by container/service name inside Docker Compose.
  // KEYCLOAK_ISSUER_URL remains the logical/public issuer used for OIDC
  // discovery's issuer validation and for the browser-facing authorization/
  // end-session redirect URLs — only the actual server-to-server HTTP
  // requests get rewritten to this host. See lib/auth/oidc.ts.
  KEYCLOAK_INTERNAL_URL: z.string().url().optional(),

  // Server-side session store — the `td_session` cookie only carries an
  // opaque session ID; the real Keycloak tokens are too large for a cookie
  // (see lib/auth/types.ts) and live in Redis instead.
  REDIS_URL: z.string().min(1),

  WEB_SESSION_SECRET: z.string().min(16),
  // Optional: browsers reject a cookie `domain` attribute that isn't a
  // suffix of the current request host, so this is only applied when set —
  // safe to leave unset for plain `localhost` standalone dev.
  WEB_COOKIE_DOMAIN: z.string().min(1).optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

let cached: WebEnv | undefined;

export function getWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  if (cached) return cached;
  const parsed = webEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid frontend/web environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only escape hatch, mirrors @topiadesk/config's equivalent. */
export function __resetWebEnvCacheForTests(): void {
  cached = undefined;
}
