import { expect, test } from '@playwright/test';

/**
 * Golden path smoke suite (broker / ACCOUNT_HANDLER — the front-line user
 * these flows are built for), run serially against the real stack: an
 * authenticated dashboard load, then Account creation, Lead→Opportunity
 * conversion, an existing Policy's lifecycle action, and Document
 * upload/versioning. Each step's assertions come from actually reading the
 * relevant page's source (toast copy, dialog titles, redirect targets) —
 * see the exploration notes this suite was built from — not guessed
 * selectors, since brittle guesses are worse than no test here.
 */
test.describe.configure({ mode: 'serial' });

const runId = Date.now();

test('dashboard loads for an authenticated user', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TopiaDesk CRM' })).toBeVisible();
  // Scoped to the role — the plain text now also appears in the pipeline
  // funnel widget's own description ("Open opportunities by stage,
  // current pipeline."), so an unscoped getByText is ambiguous.
  await expect(page.getByRole('heading', { name: 'Open opportunities' })).toBeVisible();
});

test('create an Account', async ({ page }) => {
  const accountName = `Playwright Test Account ${runId}`;
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'New account' }).first().click();
  await expect(page.getByRole('dialog', { name: 'New account' })).toBeVisible();

  await page.getByLabel('Account name').fill(accountName);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText(`Account "${accountName}" created`)).toBeVisible();
  await expect(page.getByRole('link', { name: accountName })).toBeVisible();
});

test('create a Lead and convert it to an Opportunity', async ({ page }) => {
  const firstName = 'Playwright';
  const lastName = `Testlead${runId}`;

  await page.goto('/leads');
  await page.getByRole('button', { name: 'New lead' }).first().click();
  await expect(page.getByRole('dialog', { name: 'New lead' })).toBeVisible();

  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Last name').fill(lastName);
  await page.getByLabel('Company').fill(`Playwright Testco ${runId}`);
  await page.getByRole('button', { name: 'Create lead' }).click();
  await expect(page.getByText('Lead created')).toBeVisible();

  await page.getByRole('link', { name: `${firstName} ${lastName}` }).click();
  await page.waitForURL(/\/leads\/[^/]+$/u);

  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.getByRole('dialog', { name: 'Convert lead' })).toBeVisible();

  // Opportunity name/pipeline/stage are pre-filled by the dialog per the
  // lead, but asynchronously (a useEffect sets them once the pipeline/stage
  // lists finish loading) — wait for the actual text to land instead of
  // just the dialog's presence, otherwise submitting can race the effect
  // and hit client-side "Select a pipeline"/"Select a stage" validation
  // even though the fields visibly fill in a moment later.
  await expect(page.getByLabel('Pipeline')).not.toHaveText('Select pipeline');
  await expect(page.getByLabel('Stage')).not.toHaveText('Select stage');
  await page.getByLabel('Amount (NGN)').fill('5000000');
  await page.locator('input[type="date"]').fill('2026-12-31');
  await page.getByRole('button', { name: 'Convert lead' }).click();

  await page.waitForURL(/\/opportunities\/[^/]+$/u, { timeout: 15_000 });
});

test('create a Policy', async ({ page }) => {
  const policyNumber = `PLAYWRIGHT-${runId}`;

  await page.goto('/policies');
  await page.getByRole('button', { name: 'New policy' }).click();
  await expect(page.getByRole('dialog', { name: 'New policy' })).toBeVisible();

  await page.getByLabel('Policy number').fill(policyNumber);
  await page.locator('#account').click();
  await page.getByRole('option').first().click();
  await page.locator('#carrier').click();
  await page.getByRole('option').first().click();
  await page.getByLabel('Line of business').fill('Marine Cargo');

  const inception = new Date().toISOString().slice(0, 10);
  await page.getByLabel('Expiry date').fill('2027-12-31');
  // Inception date defaults to today — only fill it if that default ever
  // changes underneath this test.
  const inceptionValue = await page.getByLabel('Inception date').inputValue();
  if (inceptionValue !== inception) await page.getByLabel('Inception date').fill(inception);

  await page.getByRole('button', { name: 'Create policy' }).click();
  await expect(page.getByText(`Policy ${policyNumber} created.`)).toBeVisible();
});

test("apply a lifecycle action on the seeded Policy", async ({ page }) => {
  await page.goto('/policies');
  const firstPolicyRow = page.getByRole('row').nth(1); // 0 = header row
  await expect(firstPolicyRow).toBeVisible();
  await firstPolicyRow.getByRole('link').first().click();
  await page.waitForURL(/\/policies\/[^/]+$/u);

  await page.getByRole('button', { name: 'New version' }).click();
  await expect(page.getByRole('dialog', { name: 'New policy version' })).toBeVisible();

  await page.getByLabel('Effective date').fill('2026-09-01');
  await page.getByLabel('Change description').fill(`Playwright smoke test ${runId}`);

  // ISSUANCE/RENEWAL apply immediately ("Apply"); ENDORSEMENT/CANCELLATION
  // are maker-checker gated ("Submit for approval") — accept either, since
  // this test only proves the lifecycle-action pathway works, not which
  // version type the seeded policy happens to be in a state to accept.
  const applyButton = page.getByRole('button', { name: 'Apply' });
  const submitForApprovalButton = page.getByRole('button', { name: 'Submit for approval' });
  await Promise.race([applyButton.waitFor(), submitForApprovalButton.waitFor()]);

  if (await applyButton.isVisible()) {
    await applyButton.click();
    await expect(page.getByText(/applied\.$/u)).toBeVisible();
  } else {
    await submitForApprovalButton.click();
    await expect(page.getByText('Submitted for approval — a different user must approve it before it takes effect.')).toBeVisible();
  }
});

test('upload a Document and add a new version', async ({ page }) => {
  await page.goto('/documents');
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Upload document' })).toBeVisible();

  await page.locator('#file').setInputFiles({
    name: `playwright-smoke-${runId}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`TopiaDesk Playwright smoke test document, run ${runId}`),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Document uploaded.')).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(`playwright-smoke-${runId}`, 'u') });
  await expect(row).toBeVisible();
  await row.getByTitle('Add new version').click();
  await expect(page.getByRole('dialog', { name: /^New version of/u })).toBeVisible();

  await page.locator('#versionFile').setInputFiles({
    name: `playwright-smoke-${runId}-v2.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`TopiaDesk Playwright smoke test document v2, run ${runId}`),
  });
  await page.getByLabel('Change note').fill('Playwright smoke test — new version');
  await page.getByRole('button', { name: 'Upload version' }).click();
  await expect(page.getByText('New version uploaded.')).toBeVisible();
});
