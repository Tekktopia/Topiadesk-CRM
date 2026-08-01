import type { JWTPayload } from 'jose';

/**
 * Hand-mirrored from backend/api/src/common/auth/authenticated-user.ts and the
 * response shape of GET /identity/me (backend/api/src/modules/identity/dto/
 * current-user-response.dto.ts). Keep in sync manually — same convention as
 * packages/shared-types/src/enums.ts.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  departmentId: string | null;
  branchId: string | null;
}

/** Shape persisted (encrypted) in the `td_session` cookie. Only what's
 * needed to call the API and to know when to refresh — never the raw ID
 * token claims beyond what we explicitly pick.
 * Extends `JWTPayload` (jose's index-signature interface) because these are
 * literally used as EncryptJWT/jwtDecrypt payloads — see ./crypto.ts. */
export interface SessionPayload extends JWTPayload {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Unix seconds. */
  accessTokenExpiresAt: number;
  /** Unix seconds; refresh tokens are also time-boxed by Keycloak. */
  refreshTokenExpiresAt: number;
  /** Keycloak subject (`sub`) — cheap identity check without a network call. */
  subject: string;
}

/** Transient state for the in-flight OAuth transaction, stored in a
 * short-lived `td_oauth_txn` cookie between /login and /callback.
 * Extends `JWTPayload` for the same reason as `SessionPayload` above. */
export interface OAuthTransactionPayload extends JWTPayload {
  codeVerifier: string;
  state: string;
  nonce: string;
  /** Relative in-app path to return to after login; validated as
   * same-origin-relative before use (open-redirect guard). */
  returnTo: string;
}
