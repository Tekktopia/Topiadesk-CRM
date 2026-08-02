import { test as setup } from '@playwright/test';
import { loginViaKeycloak } from './support/keycloak-login';

/**
 * Playwright "setup project" (see playwright.config.ts) — signs in once per
 * seeded user via the real Keycloak hosted UI and persists the resulting
 * session as storageState, so the actual spec files start already
 * authenticated instead of re-running the login flow per test.
 *
 * Passwords: `password` is the seed value from
 * infra/keycloak/realm-export.json (only valid on a genuinely fresh realm
 * import, e.g. CI's docker-compose-down-v-between-runs environment).
 * `newPassword` is what Keycloak's forced first-login UPDATE_PASSWORD sets
 * it to — loginViaKeycloak falls back to it directly when the seed password
 * no longer works (a prior local run already changed it), so both a fresh
 * CI realm and a long-lived local stack converge on the same credential.
 */
const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? 'https://app.topiadesk.localhost';

setup('authenticate as broker (ACCOUNT_HANDLER, password-only)', async ({ page }) => {
  await loginViaKeycloak(page, {
    appUrl: APP_URL,
    username: 'broker',
    password: 'ChangeMe!Broker1',
    newPassword: 'NewBroker!Pass123',
  });
  await page.context().storageState({ path: 'e2e/.auth/broker.json' });
});

setup('authenticate as admin (ADMIN, password + real TOTP enrollment)', async ({ page }) => {
  await loginViaKeycloak(page, {
    appUrl: APP_URL,
    username: 'admin',
    password: 'ChangeMe!Admin1',
    newPassword: 'Playwright!Admin1',
  });
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
