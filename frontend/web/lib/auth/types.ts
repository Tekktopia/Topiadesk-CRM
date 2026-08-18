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
  phone: string | null;
  /** Whether /api/auth/avatar has an image to stream — see identity.controller.ts's getMyAvatar. */
  hasAvatar: boolean;
  presenceStatus: 'ONLINE' | 'AWAY' | 'OFFLINE';
  roles: string[];
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  /** Ordered kpi-tile-catalog.ts keys for the dashboard's KPI strip. Null means "use the default 6". */
  kpiTilePreferences: string[] | null;
}

/** The real session contents — access/refresh/ID tokens plus their expiry.
 * Stored server-side in Redis (see ./redis-session-store.ts), keyed by the
 * opaque session ID that's the *only* thing that ever lives in the
 * `td_session` cookie (see SessionCookiePayload below). Three full Keycloak
 * JWTs together routinely exceed 4KB — browsers cap an individual cookie's
 * name=value pair at ~4096 bytes (RFC 6265's SHOULD, enforced as a hard
 * limit by Chrome and others), so a cookie holding this shape directly is
 * silently rejected/truncated by the browser. That surfaced as a genuine,
 * always-broken bug: every login looped forever (ERR_TOO_MANY_REDIRECTS) in
 * a real browser, only ever masked because prior testing used curl, whose
 * cookie handling doesn't enforce the same per-cookie size limit. */
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
  /** Which Keycloak realm these tokens belong to (default KEYCLOAK_REALM,
   * or a tenant's own realm on a tenant subdomain — see
   * lib/auth/tenant-realm.ts) — the refresh grant must hit the SAME realm
   * the tokens were issued from, so this is read at refresh time rather
   * than re-derived from whatever request happened to trigger it. */
  realm: string;
}

/** The actual shape persisted (encrypted) in the `td_session` cookie — just
 * enough to look up the real SessionPayload in Redis, and small enough to
 * never approach any browser's per-cookie size limit regardless of how
 * large Keycloak's JWTs get as more roles/scopes are added. Middleware
 * (Edge runtime, no Redis/TCP access) only ever decrypts this envelope to
 * confirm a non-tampered, unexpired session pointer exists — it never needs
 * the real tokens, so this is all it ever sees. */
export interface SessionCookiePayload extends JWTPayload {
  sessionId: string;
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
  /** Realm resolved (via tenant-realm.ts) from the Host header /login was
   * hit on — stashed here so /callback (hit on that same subdomain, but
   * re-deriving would just repeat the same lookup) uses the exact realm
   * the authorization request was actually built against. */
  realm: string;
}
