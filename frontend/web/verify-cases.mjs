/**
 * Empirical verification for the Case Management frontend batch.
 * Logs in as broker via the real Keycloak flow (Playwright, headless
 * Chromium), click-drives the new pages, and exercises the BFF endpoints
 * through the browser's authenticated session cookie.
 */
import { chromium } from '@playwright/test';

const APP = 'https://app.topiadesk.localhost';
const USER = 'broker';
const SEED_PW = 'BrokerPass123!';
const CURRENT_PW = 'NewBroker!Pass123';

function log(...args) {
  console.log('[verify]', ...args);
}

async function submitCredentials(page, username, password) {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 60_000 }), page.locator('#kc-login').click()]);
}

async function login(page) {
  await page.goto(`${APP}/api/auth/login`);
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/u);
  // broker is already past first-login setup — current password should work
  // directly; fall back to the seed password + update-password flow if not.
  await submitCredentials(page, USER, CURRENT_PW);
  let onLoginForm = (await page.locator('#username').count()) > 0;
  if (onLoginForm) {
    await submitCredentials(page, USER, SEED_PW);
  }
  const hasNewPasswordField = await page.locator('#password-new').isVisible().catch(() => false);
  if (hasNewPasswordField) {
    await page.locator('#password-new').fill(CURRENT_PW);
    await page.locator('#password-confirm').fill(CURRENT_PW);
    await page.locator('#kc-submit').click();
    await page.waitForLoadState('domcontentloaded');
  }
  await page.waitForURL((url) => url.origin === APP, { timeout: 30_000 });
  log('logged in, landed on', page.url());
}

async function api(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      return { status: res.status, json };
    },
    { method, path, body },
  );
}

function assert(cond, msg) {
  if (!cond) {
    console.error('[FAIL]', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  log('OK:', msg);
}

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const shots = process.env.SHOTS_DIR ?? '/tmp/verify-shots';

try {
  await login(page);

  // ---- page render click-through --------------------------------------
  for (const path of ['/claims', '/cases', '/sla-policies', '/macros', '/assignment-rules']) {
    await page.goto(`${APP}${path}`);
    await page.waitForLoadState('networkidle');
    const h1 = await page.locator('h1').first().textContent();
    log(`page ${path} -> h1: "${h1?.trim()}"`);
    await page.screenshot({ path: `${shots}${path.replaceAll('/', '_')}.png`, fullPage: true });
  }

  // ---- data setup via BFF ----------------------------------------------
  const lookups = await api(page, 'GET', '/api/policy-lookups');
  assert(lookups.status === 200, `policy-lookups 200 (got ${lookups.status})`);
  assert(Array.isArray(lookups.json.policies) && lookups.json.policies.length > 0, `policy-lookups returns policies (${lookups.json.policies?.length})`);
  const policyId = lookups.json.policies[0].id;
  log('using policy', lookups.json.policies[0].name, policyId);

  // ---- Claim lifecycle ---------------------------------------------------
  const claimNumber = `CLM-VERIFY-${Date.now()}`;
  const created = await api(page, 'POST', '/api/claims', {
    claimNumber,
    policyId,
    dateOfLoss: '2026-07-15',
    priority: 'HIGH',
    causeOfLoss: 'Verification run — water damage',
    reserveAmount: '250000.00',
  });
  assert(created.status === 201 || created.status === 200, `create claim (got ${created.status}: ${JSON.stringify(created.json).slice(0, 200)})`);
  const claimId = created.json.id;
  assert(created.json.status === 'NOTIFIED', `new claim starts NOTIFIED (got ${created.json.status})`);

  const transitioned = await api(page, 'POST', `/api/claims/${claimId}/status`, { status: 'UNDER_REVIEW', reason: 'Verification transition' });
  assert(transitioned.status === 201 || transitioned.status === 200, `claim NOTIFIED->UNDER_REVIEW (got ${transitioned.status}: ${JSON.stringify(transitioned.json).slice(0, 200)})`);
  assert(transitioned.json.status === 'UNDER_REVIEW', `claim now UNDER_REVIEW`);

  const badTransition = await api(page, 'POST', `/api/claims/${claimId}/status`, { status: 'SETTLED' });
  assert(badTransition.status === 400, `invalid transition UNDER_REVIEW->SETTLED rejected with 400 (got ${badTransition.status})`);

  const comment = await api(page, 'POST', `/api/claims/${claimId}/comments`, { subject: 'Verification comment', body: 'Left by the automated verification run.' });
  assert(comment.status === 201 || comment.status === 200, `add claim comment (got ${comment.status})`);

  const comments = await api(page, 'GET', `/api/claims/${claimId}/comments`);
  assert(comments.json.some((c) => c.subject === 'Verification comment'), 'comment appears in claim comment list');

  const history = await api(page, 'GET', `/api/claims/${claimId}/status-history`);
  assert(history.json.length >= 1 && history.json.some((h) => h.toStatus === 'UNDER_REVIEW'), `status history recorded (${history.json.length} rows)`);

  // watcher add/remove — use own user id from the session
  const session = await api(page, 'GET', '/api/auth/session');
  const myUserId = session.json.user?.id;
  if (myUserId) {
    const addW = await api(page, 'POST', `/api/claims/${claimId}/watchers`, { userId: myUserId });
    assert(addW.status === 201 || addW.status === 200, `add watcher (got ${addW.status})`);
    const delW = await api(page, 'DELETE', `/api/claims/${claimId}/watchers/${myUserId}`);
    assert(delW.status === 200, `remove watcher (got ${delW.status})`);
  }

  // ---- claim detail page renders the real data -------------------------
  await page.goto(`${APP}/claims/${claimId}`);
  await page.waitForLoadState('networkidle');
  const claimBody = await page.locator('body').textContent();
  assert(claimBody.includes(claimNumber), `claim detail page shows ${claimNumber}`);
  assert(claimBody.includes('Under Review'), 'claim detail shows Under Review badge');
  assert(claimBody.includes('Verification comment'), 'claim detail shows the comment');
  await page.screenshot({ path: `${shots}/_claim_detail.png`, fullPage: true });

  // ---- Case + macro ------------------------------------------------------
  const kase = await api(page, 'POST', '/api/cases', {
    caseType: 'SERVICE_REQUEST',
    subject: `Verification case ${Date.now()}`,
    description: 'Created by the automated verification run.',
    priority: 'MEDIUM',
  });
  assert(kase.status === 201 || kase.status === 200, `create case (got ${kase.status}: ${JSON.stringify(kase.json).slice(0, 200)})`);
  const caseId = kase.json.id;
  assert(kase.json.status === 'NEW', `new case starts NEW (got ${kase.json.status})`);
  assert(kase.json.caseNumber?.startsWith('CASE-'), `caseNumber server-generated (${kase.json.caseNumber})`);

  const open = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'OPEN' });
  assert(open.json.status === 'OPEN', 'case NEW->OPEN');
  const pend = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'PENDING_CARRIER' });
  assert(pend.json.status === 'PENDING_CARRIER', 'case OPEN->PENDING_CARRIER');
  const back = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'OPEN' });
  assert(back.json.status === 'OPEN', 'case PENDING_CARRIER->OPEN');

  // macro: create one, preview it, apply it, confirm the case reflects it
  const macro = await api(page, 'POST', '/api/macros', {
    name: `Verify macro ${Date.now()}`,
    entityType: 'CASE',
    actions: [
      { actionType: 'SET_PRIORITY', params: { priority: 'URGENT' } },
      { actionType: 'ADD_INTERNAL_NOTE', params: { subject: 'Macro note', body: 'Applied by verification macro' } },
    ],
  });
  assert(macro.status === 201 || macro.status === 200, `create macro (got ${macro.status}: ${JSON.stringify(macro.json).slice(0, 200)})`);
  const macroId = macro.json.id;

  const preview = await api(page, 'POST', `/api/macros/${macroId}/preview`, { entityType: 'CASE', entityId: caseId });
  assert(preview.status === 201 || preview.status === 200, `macro preview (got ${preview.status})`);
  log('preview changes:', JSON.stringify(preview.json.changes));

  const applied = await api(page, 'POST', `/api/cases/${caseId}/apply-macro/${macroId}`);
  assert(applied.status === 201 || applied.status === 200, `apply macro (got ${applied.status}: ${JSON.stringify(applied.json).slice(0, 300)})`);
  log('apply results:', JSON.stringify(applied.json.results));

  const after = await api(page, 'GET', `/api/cases/${caseId}`);
  assert(after.json.priority === 'URGENT', `macro set priority URGENT (got ${after.json.priority})`);
  const caseComments = await api(page, 'GET', `/api/cases/${caseId}/comments`);
  assert(caseComments.json.some((c) => c.subject === 'Macro note'), 'macro internal note visible in case comments');

  // ---- case detail page renders the post-macro state -------------------
  await page.goto(`${APP}/cases/${caseId}`);
  await page.waitForLoadState('networkidle');
  const caseBody = await page.locator('body').textContent();
  assert(caseBody.includes(kase.json.caseNumber), `case detail shows ${kase.json.caseNumber}`);
  assert(caseBody.includes('Urgent'), 'case detail shows Urgent priority');
  assert(caseBody.includes('Macro note'), 'case detail shows macro-added note');
  await page.screenshot({ path: `${shots}/_case_detail.png`, fullPage: true });

  // ---- queue self-assign -------------------------------------------------
  const queueCase = await api(page, 'POST', '/api/cases', { caseType: 'ENQUIRY', subject: `Queue verify ${Date.now()}` });
  const queue = await api(page, 'GET', '/api/cases/queue');
  assert(queue.json.some((c) => c.id === queueCase.json.id), 'unassigned case appears in queue');
  const claimed = await api(page, 'POST', `/api/cases/${queueCase.json.id}/claim`);
  assert(claimed.json.assignedToId, `queue Claim self-assigns (assignedToId ${claimed.json.assignedToId})`);

  // ---- config-tier reads (broker may 403 on sla_config — either is fine,
  // what matters is the BFF proxies status/body faithfully) ----------------
  for (const path of ['/api/sla-policies', '/api/assignment-rules', '/api/case-categories', '/api/loss-cause-categories', '/api/business-hours']) {
    const res = await api(page, 'GET', path);
    log(`GET ${path} -> ${res.status}${Array.isArray(res.json) ? ` (${res.json.length} rows)` : ` ${JSON.stringify(res.json).slice(0, 120)}`}`);
  }

  log('ALL CHECKS PASSED');
} finally {
  await browser.close();
}
