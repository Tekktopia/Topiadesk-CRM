import jwt, { type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface KeycloakTokenClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  exp: number;
  iss: string;
}

export interface JwtVerifierConfig {
  jwksUri: string;
  issuerUrl: string;
  /** Docker Compose only — see resolveInternalJwksUri's comment below. */
  internalUrl?: string;
  /**
   * Expected `aud` claim — a token minted for a client that never had this
   * resource server in its audience (e.g. a different app registered on
   * the same realm) is otherwise accepted as long as the signature and
   * issuer check out. Requires the issuing client to actually carry an
   * Audience protocol mapper naming this value (see
   * keycloak-realm-provisioning.ts's `topiadesk-web` client def) — omit
   * only for a realm/client that doesn't have one configured yet, since
   * jsonwebtoken rejects every token outright otherwise.
   */
  audience?: string;
}

/**
 * jwks-rsa needs a URL it can actually reach from inside the api container.
 * `jwksUri` is the public, browser/host-resolvable hostname
 * (auth.topiadesk.localhost) — Docker Compose's embedded DNS doesn't know
 * it. When `internalUrl` is set (Docker Compose deployments), swap just the
 * origin so the request lands on the `keycloak` service directly; the
 * path/query (realm, protocol/openid-connect/certs) is untouched. In a real
 * deployment where public DNS resolves everywhere, `internalUrl` is simply
 * left unset and this is a no-op.
 */
function resolveInternalJwksUri(config: JwtVerifierConfig): string {
  if (!config.internalUrl) return config.jwksUri;
  const uri = new URL(config.jwksUri);
  const internal = new URL(config.internalUrl);
  uri.protocol = internal.protocol;
  uri.host = internal.host;
  return uri.toString();
}

/**
 * Thin wrapper around jsonwebtoken + jwks-rsa validating tokens issued by a
 * self-hosted Keycloak realm. jwks-rsa caches signing keys client-side
 * (rate-limited + cached) so a brief Keycloak blip doesn't fail validation
 * of already-issued, still-valid tokens — see docs/runbook.md "Keycloak
 * availability" for the accepted Phase-1 single-instance limitation.
 *
 * Takes an explicit `{ jwksUri, issuerUrl, internalUrl }` rather than the
 * whole `Env` — RlsContextMiddleware instantiates one of these for the main
 * "topiadesk" (tenant) realm, and the Platform-Admin API module
 * (backend/api/src/modules/platform/) instantiates a SECOND, independent
 * one for the completely separate "topiadesk-platform" realm. Two realms,
 * two verifiers, one class.
 */
export class JwtVerifier {
  private readonly client: jwksClient.JwksClient;

  constructor(private readonly config: JwtVerifierConfig) {
    this.client = jwksClient({
      jwksUri: resolveInternalJwksUri(config),
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
        { issuer: this.config.issuerUrl, algorithms: ['RS256'], audience: this.config.audience },
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
