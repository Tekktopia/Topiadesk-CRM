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
      jwksUri: env.KEYCLOAK_JWKS_URI,
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
