import { test as setup } from '@playwright/test';
import { loginViaKeycloak } from './support/keycloak-login';

const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? 'https://app.topiadesk.localhost';

setup('authenticate as compliance (COMPLIANCE_OFFICER, password + existing TOTP)', async ({ page }) => {
  await loginViaKeycloak(page, {
    appUrl: APP_URL,
    username: 'compliance',
    password: 'VerifyCompliance!2026',
    newPassword: 'VerifyCompliance!2026',
  });
  await page.context().storageState({ path: 'e2e/.auth/compliance.json' });
});
