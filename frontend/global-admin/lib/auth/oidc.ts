import * as client from 'openid-client';
import { getGlobalAdminEnv } from '../env';

/**
 * OIDC client for the "topiadesk-platform" Keycloak realm — same
 * `openid-client` v6, PKCE-only public-client approach as
 * frontend/web/lib/auth/oidc.ts (see that file's header comment for the
 * full reasoning); pointed at KEYCLOAK_PLATFORM_ISSUER_URL/
 * KEYCLOAK_PLATFORM_CLIENT_ID instead of the tenant realm's.
 */
let configPromise: Promise<client.Configuration> | undefined;

function internalKeycloakFetch(publicIssuer: URL, internalUrl: string): client.CustomFetch {
  const internal = new URL(internalUrl);
  return (url, options) => {
    const target = new URL(url);
    if (target.host === publicIssuer.host) {
      target.protocol = internal.protocol;
      target.host = internal.host;
    }
    // @ts-expect-error - CustomFetchOptions vs RequestInit, see frontend/web/lib/auth/oidc.ts's identical comment
    return fetch(target, options);
  };
}

function discoverConfig(): Promise<client.Configuration> {
  const env = getGlobalAdminEnv();
  const issuer = new URL(env.KEYCLOAK_PLATFORM_ISSUER_URL);
  const options = env.KEYCLOAK_INTERNAL_URL
    ? { [client.customFetch]: internalKeycloakFetch(issuer, env.KEYCLOAK_INTERNAL_URL) }
    : undefined;
  return client.discovery(issuer, env.KEYCLOAK_PLATFORM_CLIENT_ID, undefined, client.None(), options).catch((err: unknown) => {
    configPromise = undefined;
    throw err;
  });
}

export function getOidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    configPromise = discoverConfig();
  }
  return configPromise as Promise<client.Configuration>;
}

export const OIDC_SCOPE = 'openid profile email';

export async function buildAuthorizationRequest(redirectUri: string) {
  const config = await getOidcConfig();
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

export async function exchangeCodeForTokens(currentUrl: URL, checks: { codeVerifier: string; state: string; nonce: string }) {
  const config = await getOidcConfig();
  return client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
  });
}

export async function refreshTokens(refreshToken: string) {
  const config = await getOidcConfig();
  return client.refreshTokenGrant(config, refreshToken);
}

export async function buildLogoutUrl(idToken: string, postLogoutRedirectUri: string): Promise<URL> {
  const config = await getOidcConfig();
  return client.buildEndSessionUrl(config, { id_token_hint: idToken, post_logout_redirect_uri: postLogoutRedirectUri });
}
