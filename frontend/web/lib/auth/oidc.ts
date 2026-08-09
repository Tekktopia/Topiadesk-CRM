import * as client from 'openid-client';
import { getWebEnv } from '../env';

/**
 * OIDC library choice: `openid-client` (panva/openid-client), the
 * de-facto standard, actively-maintained, certified OpenID Connect client
 * for Node.js — rather than hand-rolling PKCE/token-exchange crypto, and
 * rather than Auth.js/NextAuth. Reasoning:
 *
 *  - Our Keycloak web client (KEYCLOAK_CLIENT_ID_WEB) is registered as a
 *    PUBLIC client (no KEYCLOAK_CLIENT_SECRET_WEB exists in .env.example,
 *    by design — see Batch-2 handoff notes) secured by PKCE alone. That's
 *    a deliberate, narrow configuration we want full visibility into
 *    (exactly which params hit the token endpoint, `client.None()` client
 *    authentication) rather than relying on a higher-level auth framework's
 *    assumptions about confidential vs. public clients — this is a
 *    compliance-sensitive insurance product, and an explicit, auditable
 *    flow is worth the extra code versus a framework's implicit one.
 *  - openid-client v6 is runtime-agnostic (Web Crypto/fetch-based, no
 *    Node-only APIs in the request path), so the same code works in both
 *    Node.js route handlers and (if ever needed) an Edge runtime.
 *  - It gives us `buildAuthorizationUrl`/`authorizationCodeGrant`/
 *    `refreshTokenGrant`/`buildEndSessionUrl` as small, composable
 *    functions we call explicitly from our own route handlers — token
 *    exchange, refresh, and cookie writes all stay in code we own and can
 *    audit line-by-line, versus a framework's `jwt`/`session` callback
 *    indirection.
 *
 * Discovery is cached process-wide, keyed by realm (Keycloak's issuer
 * metadata doesn't change at runtime, but a request now may belong to any
 * tenant's own realm, not one fixed realm — see lib/auth/tenant-realm.ts)
 * and only ever invoked lazily, from request-time code — never at module
 * scope — so `next build` never needs live Keycloak connectivity.
 */
const configPromises = new Map<string, Promise<client.Configuration>>();

/**
 * Discovery, token exchange, and refresh all happen server-side (this code
 * runs in Route Handlers), so they need to reach Keycloak by container
 * name inside Docker Compose — auth.topiadesk.localhost (KEYCLOAK_ISSUER_URL)
 * only resolves via host-machine/browser DNS, never Docker's embedded DNS.
 * Discovery's issuer validation, and the authorization/end-session URLs
 * handed back to the browser, must still be the public issuer though (that's
 * literally what Keycloak stamps into the `iss` claim and what the user's
 * browser can actually reach) — so instead of pointing discovery itself at
 * the internal URL (which would fail issuer validation, since Keycloak's
 * discovery document always reports the public KC_HOSTNAME), we keep the
 * public URL as the logical issuer and rewrite only the outgoing request's
 * origin via a custom fetch. See openid-client's `customFetch` docs for this
 * exact pattern. In a real deployment where public DNS resolves everywhere,
 * KEYCLOAK_INTERNAL_URL is simply left unset and this is a no-op passthrough.
 */
function internalKeycloakFetch(publicIssuer: URL, internalUrl: string): client.CustomFetch {
  const internal = new URL(internalUrl);
  return (url, options) => {
    const target = new URL(url);
    if (target.host === publicIssuer.host) {
      target.protocol = internal.protocol;
      target.host = internal.host;
    }
    // openid-client's CustomFetchOptions is structurally fetch-compatible at
    // runtime but not identical to lib.dom's RequestInit (e.g. `body`'s
    // FetchBody type vs BodyInit) — same friction openid-client's own docs
    // show working around with a type-ignore when bridging to fetch-like
    // callers.
    // @ts-expect-error - CustomFetchOptions vs RequestInit, see comment above
    return fetch(target, options);
  };
}

/** Builds the issuer URL for an arbitrary realm from KEYCLOAK_ISSUER_URL's
 * own origin — that env var is `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
 * so swapping the last path segment reaches any other realm on the same
 * Keycloak server without needing a second env var. */
function issuerUrlForRealm(realmName: string): URL {
  const defaultIssuer = new URL(getWebEnv().KEYCLOAK_ISSUER_URL);
  return new URL(`/realms/${realmName}`, defaultIssuer.origin);
}

function discoverConfig(realmName: string): Promise<client.Configuration> {
  const env = getWebEnv();
  const issuer = issuerUrlForRealm(realmName);
  const options = env.KEYCLOAK_INTERNAL_URL
    ? { [client.customFetch]: internalKeycloakFetch(issuer, env.KEYCLOAK_INTERNAL_URL) }
    : undefined;
  return client.discovery(issuer, env.KEYCLOAK_CLIENT_ID_WEB, undefined, client.None(), options).catch(
    (err: unknown) => {
      // Reset so a transient discovery failure (e.g. Keycloak not up yet
      // in dev, or a realm that's mid-provisioning) doesn't permanently
      // poison the cache for the process.
      configPromises.delete(realmName);
      throw err;
    },
  );
}

export function getOidcConfig(realmName: string): Promise<client.Configuration> {
  let promise = configPromises.get(realmName);
  if (!promise) {
    promise = discoverConfig(realmName);
    configPromises.set(realmName, promise);
  }
  return promise;
}

export const OIDC_SCOPE = 'openid profile email';

export async function buildAuthorizationRequest(realmName: string, redirectUri: string) {
  const config = await getOidcConfig(realmName);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { authorizationUrl, codeVerifier, state, nonce };
}

export async function exchangeCodeForTokens(
  realmName: string,
  currentUrl: URL,
  checks: { codeVerifier: string; state: string; nonce: string },
) {
  const config = await getOidcConfig(realmName);
  return client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
  });
}

export async function refreshTokens(realmName: string, refreshToken: string) {
  const config = await getOidcConfig(realmName);
  return client.refreshTokenGrant(config, refreshToken);
}

export async function buildLogoutUrl(realmName: string, idToken: string, postLogoutRedirectUri: string): Promise<URL> {
  const config = await getOidcConfig(realmName);
  return client.buildEndSessionUrl(config, {
    id_token_hint: idToken,
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
}
