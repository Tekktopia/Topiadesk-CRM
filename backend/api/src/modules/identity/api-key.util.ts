import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'tdk_';

/**
 * Same SHA-256-hex-digest-as-lookup-key approach as scim-token.util.ts —
 * see that file's comment for why a fast hash (not bcrypt/argon2) is
 * correct here. `tdk_` (TopiaDesk Key) is a distinct, unambiguous prefix
 * RlsContextMiddleware checks for before attempting JWT verification — a
 * real Keycloak JWT can never start with this (JWTs are three dot-
 * separated base64url segments beginning with `eyJ`).
 */
export function generateApiKey(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function lastFourOf(rawKey: string): string {
  return rawKey.slice(-4);
}
