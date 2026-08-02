import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { generateTotpCode } from './totp';

// frontend/web has no "type": "module" — this file runs as CommonJS
// (via Playwright Test's own transform), so plain __dirname is available.
const SECRETS_FILE = join(__dirname, '..', '.auth', 'totp-secrets.json');

/**
 * Once a user has TOTP configured, every subsequent login challenges for a
 * code (a different Keycloak page from the one-time CONFIGURE_TOTP setup —
 * no secret is re-displayed, just an `#otp` field to fill). CI always runs
 * against a freshly-imported realm (docker compose down -v between runs —
 * see .github/workflows/ci.yml), so it only ever sees the one-time setup
 * page. Locally, against a long-lived stack, a re-run can hit either page
 * depending on whether a prior run already completed setup — so the secret
 * is persisted here the first time it's seen, to answer that later
 * challenge without needing the setup page again.
 */
function loadStoredSecret(username: string): string | undefined {
  if (!existsSync(SECRETS_FILE)) return undefined;
  const store = JSON.parse(readFileSync(SECRETS_FILE, 'utf-8')) as Record<string, string>;
  return store[username];
}

function storeSecret(username: string, secret: string): void {
  mkdirSync(dirname(SECRETS_FILE), { recursive: true });
  const store: Record<string, string> = existsSync(SECRETS_FILE)
    ? (JSON.parse(readFileSync(SECRETS_FILE, 'utf-8')) as Record<string, string>)
    : {};
  store[username] = secret;
  writeFileSync(SECRETS_FILE, JSON.stringify(store, null, 2));
}

/**
 * Drives TopiaDesk's real login flow end to end: /api/auth/login redirects
 * to Keycloak's actual hosted UI (not a mock/stub — this is the same
 * Authorization Code + PKCE flow a real user goes through), so this signs
 * in for real and lands back on the app once the session cookie is set.
 *
 * Seeded users (infra/keycloak/realm-export.json) carry Keycloak
 * `requiredActions` that only fire on first login and vary per user:
 * broker/manager need only UPDATE_PASSWORD; admin/compliance additionally
 * need CONFIGURE_TOTP. The order Keycloak presents them in isn't something
 * this code should assume, so it loops on whatever required-action page
 * appears next until the browser is back on the app's own origin.
 */
export interface LoginOptions {
  appUrl: string;
  username: string;
  password: string;
  /** New password to set when Keycloak forces a first-login change — must
   * satisfy the realm's password policy (12+ chars, upper/lower/digit/special)
   * and differ from the username. */
  newPassword: string;
}

async function submitCredentials(page: Page, username: string, password: string): Promise<void> {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 60_000 }), page.locator('#kc-login').click()]);
}

export async function loginViaKeycloak(page: Page, opts: LoginOptions): Promise<void> {
  await page.goto('/api/auth/login');
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/u);

  // The seed password only works on a genuinely first-ever login (fresh
  // realm import, e.g. CI). On a re-run against a long-lived local stack a
  // prior run already changed it, so retry with the already-changed one —
  // whichever succeeds, the loop below still ends up back on newPassword.
  await submitCredentials(page, opts.username, opts.password);
  const stillOnLoginForm = (await page.locator('#username').count()) > 0 && (await page.locator('#password').count()) > 0;
  if (stillOnLoginForm) {
    await submitCredentials(page, opts.username, opts.newPassword);
  }

  const appOrigin = new URL(opts.appUrl).origin;
  let sawPlainLoginFormOnce = false;

  // Required actions can chain (e.g. admin: CONFIGURE_TOTP then UPDATE_
  // PASSWORD, in whatever order Keycloak presents them) — loop until we're
  // back on the app.
  for (let iterations = 0; iterations < 6; iterations += 1) {
    if (page.url().startsWith(appOrigin)) return;

    const hasNewPasswordField = await page.locator('#password-new').isVisible().catch(() => false);
    if (hasNewPasswordField) {
      await page.locator('#password-new').fill(opts.newPassword);
      await page.locator('#password-confirm').fill(opts.newPassword);
      await page.locator('#kc-submit').click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    const hasTotpSecret = (await page.locator('#totpSecret').count()) > 0;
    if (hasTotpSecret) {
      const secret = await page.locator('#totpSecret').getAttribute('value');
      if (!secret) throw new Error('CONFIGURE_TOTP page rendered but #totpSecret has no value');
      storeSecret(opts.username, secret);
      await page.locator('#userLabel').fill('Playwright');
      await page.locator('#totp').fill(generateTotpCode(secret));
      await page.locator('#saveTOTPBtn').click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    // Already-configured account, ordinary login: Keycloak challenges for a
    // fresh code instead of re-running setup (no #totpSecret on this page).
    const hasOtpChallenge = (await page.locator('#otp').count()) > 0;
    if (hasOtpChallenge) {
      const secret = loadStoredSecret(opts.username);
      if (!secret) {
        throw new Error(
          `loginViaKeycloak: "${opts.username}" was challenged for an OTP code but no secret is on file ` +
            `(${SECRETS_FILE}). Delete frontend/web/e2e/.auth/ to force a fresh CONFIGURE_TOTP setup.`,
        );
      }
      await page.locator('#otp').fill(generateTotpCode(secret));
      await page.locator('#kc-login').click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    const backAtPlainLogin = (await page.locator('#username').count()) > 0 && (await page.locator('#password').count()) > 0;
    if (backAtPlainLogin && !sawPlainLoginFormOnce) {
      // Observed occasionally when a required action completes but the
      // Keycloak auth session restarts the flow — retrying once with the
      // (by-now-current) newPassword resolves it; a second occurrence means
      // something is genuinely wrong rather than a one-off flow restart.
      sawPlainLoginFormOnce = true;
      await submitCredentials(page, opts.username, opts.newPassword);
      continue;
    }

    throw new Error(
      `loginViaKeycloak: unrecognized page while signing in as "${opts.username}" (url: ${page.url()}). ` +
        'None of update-password, TOTP-setup, OTP-challenge, or a recoverable login-form restart was found.',
    );
  }

  await page.waitForURL((url) => url.origin === appOrigin, { timeout: 15_000 });
}
