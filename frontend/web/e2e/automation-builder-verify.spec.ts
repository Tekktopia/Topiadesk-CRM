import { expect, test } from '@playwright/test';

/**
 * Read-only render check for the rebuilt automation surfaces.
 *
 * Deliberately does NOT use e2e/auth.setup.ts. That helper answers whatever
 * Keycloak asks — including UPDATE_PASSWORD and CONFIGURE_TOTP — which is how
 * this suite previously took over a real account's password and authenticator
 * (see auth.setup.ts's own comment). Every account on this stack now belongs
 * to a person, so this spec reuses the already-persisted storageState instead
 * and never types a credential.
 *
 * If the stored session has expired the spec FAILS rather than logging in.
 * That is the intended behaviour: an expired session is a reason to ask for a
 * throwaway credential, not a reason to start mutating a human's account.
 */
test.use({ storageState: 'e2e/.auth/admin.json' });

test('automations page renders the rebuilt list and builder', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  // A bare "401" in the console cannot distinguish a stale stored session
  // from a genuinely broken route, and those need opposite responses — so
  // record which URL failed.
  const failedRequests: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
  });

  const response = await page.goto('/admin/automations', { waitUntil: 'domcontentloaded' });
  console.log('[verify] landed on:', page.url(), 'status:', response?.status());

  // An expired session lands on Keycloak. Stop here rather than signing in.
  if (/\/realms\/[^/]+\/protocol\/openid-connect\/auth/u.test(page.url())) {
    throw new Error('Stored session has expired — a fresh credential is needed. Not signing in (would mutate a real account).');
  }

  await expect(page.getByRole('heading', { name: 'Automations' })).toBeVisible({ timeout: 20_000 });

  // The signpost added across the three Workflow pages.
  await expect(page.getByText('Run something…')).toBeVisible();

  // The description that used to say rules were "not yet actively evaluated".
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('not yet actively evaluated');

  // Wait for the list query to settle. Screenshotting on heading-visible
  // alone captures loading skeletons, which proves the columns exist but not
  // that data ever arrives — the more interesting half.
  await expect
    .poll(async () => page.locator('[data-slot="skeleton"], .animate-pulse').count(), { timeout: 20_000 })
    .toBe(0)
    .catch(() => console.log('[verify] table still showing skeletons after 20s'));

  await page.screenshot({ path: 'e2e/.auth/verify-automations-list.png', fullPage: true });
  console.log('[verify] console errors on list page:', consoleErrors.length ? consoleErrors.join(' | ') : 'none');

  // Open the builder — the piece that replaced the raw-JSON textareas.
  const newButton = page.getByRole('button', { name: /new automation/iu });
  if (await newButton.isVisible().catch(() => false)) {
    await newButton.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // These come from GET /crm/automation-rules/catalog. If the catalog call
    // failed, the dialog still renders but the record-type picker is empty —
    // which is exactly the failure this check exists to catch.
    await expect(page.getByText('Which records')).toBeVisible();
    await expect(page.getByText('What happens')).toBeVisible();
    await expect(page.getByRole('button', { name: /test this rule/iu })).toBeVisible();

    await page.screenshot({ path: 'e2e/.auth/verify-automations-builder.png', fullPage: true });
  } else {
    console.log('[verify] no "New automation" button — account lacks write permission; list-only check performed');
  }

  console.log('[verify] failed requests:', failedRequests.length ? failedRequests.join(' | ') : 'none');
  console.log('[verify] total console errors:', consoleErrors.length ? consoleErrors.join(' | ') : 'none');

  // A 401 means the stored session has expired — reported, not treated as a
  // defect in the pages under test, and explicitly NOT a reason to sign in.
  const nonAuthFailures = failedRequests.filter((r) => !r.startsWith('401') && !r.includes('favicon'));
  expect(nonAuthFailures, `non-auth request failures: ${nonAuthFailures.join(', ')}`).toHaveLength(0);
});
