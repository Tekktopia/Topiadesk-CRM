import { expect, test } from '@playwright/test';

/**
 * Phase 2 golden path smoke suite (broker / ACCOUNT_HANDLER), run serially
 * against the real stack — same discipline as golden-path.spec.ts: a Case
 * created, moved through a status transition, and commented on; a
 * Knowledge Base draft article created; a Campaign audience segment
 * created; a report actually run; and the global (⌘K) search finding a
 * real record and navigating to it. Selectors and copy come from reading
 * the actual components (case-form-dialog.tsx, case-lifecycle-actions.tsx,
 * comments-section.tsx / packages/ui's activity-timeline.tsx,
 * new-article-view.tsx, audience-segment-form-dialog.tsx,
 * report-runner-view.tsx, app/command-palette.tsx), not guessed.
 *
 * Deliberately out of scope here (needs a second, different-role
 * approver — see admin-mfa.spec.ts for the pattern): Knowledge Base's
 * submit-for-review → approve → publish maker-checker flow, and Campaign
 * send (segment → template → campaign → send was verified manually
 * against a live MailDev capture during this module's build, not
 * re-automated here).
 */
test.describe.configure({ mode: 'serial' });

const runId = Date.now();

test('create a Case, change its status, and add a comment', async ({ page }) => {
  const subject = `Playwright case ${runId}`;

  await page.goto('/cases');
  await page.getByRole('button', { name: 'New case' }).click();
  await expect(page.getByRole('dialog', { name: 'New case' })).toBeVisible();

  // Type/Priority default to ENQUIRY/MEDIUM (case-form-dialog.tsx's
  // DEFAULTS) — Subject is the only field the schema actually requires.
  await page.getByLabel('Subject').fill(subject);
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(`"${subject}" created`)).toBeVisible();

  await page.getByRole('link', { name: subject }).click();
  await page.waitForURL(/\/cases\/[^/]+$/u);

  await page.getByRole('button', { name: 'Change status' }).click();
  // Whichever transition is first in CASE_STATUS_TRANSITIONS[current] —
  // this proves the lifecycle-action pathway works, not a specific target
  // status (mirrors golden-path.spec.ts's Apply/Submit-for-approval
  // either/or for the same reason).
  await page.getByRole('menuitem').first().click();
  await expect(page.getByText(/^Case marked /u)).toBeVisible();

  // Comment thread reuses packages/ui's ActivityTimeline "Log activity"
  // form (comments-section.tsx) — Subject is its only required field.
  const commentSubject = `Playwright comment ${runId}`;
  await page.getByLabel('Subject', { exact: true }).fill(commentSubject);
  await page.getByRole('button', { name: 'Log activity' }).click();
  await expect(page.getByText(commentSubject)).toBeVisible();
});

test('create a Knowledge Base draft article', async ({ page }) => {
  const title = `Playwright KB article ${runId}`;

  await page.goto('/knowledge/new');
  await page.getByLabel('Title').fill(title);
  await page.locator('textarea').fill(`# ${title}\n\nBody written by the Playwright Phase 2 smoke test.`);
  await page.getByRole('button', { name: 'Create draft' }).click();

  // No toast on create (new-article-view.tsx redirects straight to the
  // new article on success) — the URL change is the assertion.
  await page.waitForURL(/\/knowledge\/[^/]+$/u, { timeout: 15_000 });
  await expect(page.getByText(title).first()).toBeVisible();
});

test('create an Audience Segment', async ({ page }) => {
  const name = `Playwright segment ${runId}`;

  await page.goto('/audience-segments');
  await page.getByRole('button', { name: 'New segment' }).first().click();
  await expect(page.getByRole('dialog', { name: 'New audience segment' })).toBeVisible();

  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create segment' }).click();
  await expect(page.getByText(`"${name}" created`)).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
});

test('run a report', async ({ page }) => {
  await page.goto('/reports');
  // First card in the fixed report registry — this proves the run/export
  // pathway works end-to-end, not which specific report.
  await page.locator('a[href^="/reports/"]').first().click();
  await page.waitForURL(/\/reports\/[^/]+$/u);

  await page.getByRole('button', { name: 'Run report' }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ rows? · generated/u)).toBeVisible();
});

test('global search (⌘K) finds a record and navigates to it', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search accounts, policies, cases, claims…')).toBeVisible();

  await page.getByPlaceholder('Search accounts, policies, cases, claims…').fill('Delta');
  const firstResult = page.locator('[cmdk-item]').first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  const resultText = await firstResult.innerText();
  await firstResult.click();

  // Whatever entity type matched first, its href should have taken us off
  // the dashboard onto that record's page.
  await expect(page).not.toHaveURL('/');
  expect(resultText.toLowerCase()).toContain('delta');
});
