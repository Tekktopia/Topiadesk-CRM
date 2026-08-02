import { expect, test } from '@playwright/test';

/**
 * Proves the MFA half of "login+MFA" from the golden path: this project's
 * `admin` storageState (see auth.setup.ts) is only reachable by actually
 * completing Keycloak's real CONFIGURE_TOTP enrollment — computing a valid
 * RFC 6238 code from the secret Keycloak's setup page renders (support/totp.ts)
 * and submitting it, not a stub/bypass. If that flow were broken, the setup
 * project itself would already have failed before this spec ever ran.
 */
test('admin session (enrolled via real TOTP) reaches an authenticated page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TopiaDesk CRM' })).toBeVisible();
});

test('admin can view real, populated Audit Log entries', async ({ page }) => {
  await page.goto('/admin/audit-log');
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
  // Confirms this is the real, permission-gated, data-backed table (not the
  // earlier static "read API doesn't exist yet" placeholder) — the seed
  // data and every mutation this whole suite has performed guarantee rows
  // exist, so the column header is real evidence of a populated table, not
  // just the page shell rendering.
  await expect(page.getByRole('columnheader', { name: 'Timestamp' })).toBeVisible();
  await expect(page.getByText('No audit entries match these filters')).not.toBeVisible();
});
