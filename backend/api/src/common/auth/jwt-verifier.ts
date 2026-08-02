import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { Env } from '@topiadesk/config';

export interface KeycloakTokenClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  exp: number;
  iss: string;
}

/**
 * jwks-rsa needs a URL it can actually reach from inside the api container.
 * KEYCLOAK_JWKS_URI is the public, browser/host-resolvable hostname
 * (auth.topiadesk.localhost) — Docker Compose's embedded DNS doesn't know
 * it. When KEYCLOAK_INTERNAL_URL is set (Docker Compose deployments), swap
 * just the origin so the request lands on the `keycloak` service directly;
 * the path/query (realm, protocol/openid-connect/certs) is untouched. In a
 * real deployment where public DNS resolves everywhere, KEYCLOAK_INTERNAL_URL
 * is simply left unset and this is a no-op.
 */
function resolveInternalJwksUri(env: Env): string {
  if (!env.KEYCLOAK_INTERNAL_URL) return env.KEYCLOAK_JWKS_URI;
  const uri = new URL(env.KEYCLOAK_JWKS_URI);
  const internal = new URL(env.KEYCLOAK_INTERNAL_URL);
  uri.protocol = internal.protocol;
  uri.host = internal.host;
  return uri.toString();
}

/**
 * Thin wrapper around jsonwebtoken + jwks-rsa validating tokens issued by
 * our self-hosted Keycloak realm. jwks-rsa caches signing keys client-side
 * (rate-limited + cached) so a brief Keycloak blip doesn't fail validation
 * of already-issued, still-valid tokens — see docs/runbook.md "Keycloak
 * availability" for the accepted Phase-1 single-instance limitation.
 */
export class JwtVerifier {
  private readonly client: jwksClient.JwksClient;

  constructor(private readonly env: Env) {
    this.client = jwksClient({
      jwksUri: resolveInternalJwksUri(env),
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
    });
  }

  private getSigningKey = (header: JwtHeader, callback: SigningKeyCallback) => {
    this.client.getSigningKey(header.kid, (err, key) => {
      if (err || !key) {
        callback(err ?? new Error('Signing key not found'));
        return;
      }
      callback(null, key.getPublicKey());
    });
  };

  verify(token: string): Promise<KeycloakTokenClaims> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getSigningKey,
        { issuer: this.env.KEYCLOAK_ISSUER_URL, algorithms: ['RS256'] },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            reject(err ?? new Error('Invalid token'));
            return;
          }
          resolve(decoded as KeycloakTokenClaims);
        },
      );
    });
  }
}
