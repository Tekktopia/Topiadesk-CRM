/**
 * Second verification pass, logged in as `admin` (ADMIN role) instead of
 * `broker` (ACCOUNT_HANDLER). The broker run hit a Postgres RLS rejection
 * ("new row violates row-level security policy for table \"cases\"") on
 * POST /cases even though role_permissions has case:write:OWN seeded for
 * ACCOUNT_HANDLER identical to the claim:write:OWN row that worked fine —
 * see packages/db/prisma/rls/002_policies.sql's app_max_scope(), which
 * special-cases role='ADMIN' to return 'ALL' without touching
 * role_permissions at all. Running as admin isolates whether this is a
 * bug in the Case Management frontend/BFF (it would still fail) or a
 * backend/db-state issue in the OWN/DEPARTMENT scope lookup path
 * specifically (it would pass here, since ADMIN skips that path).
 */
import { createHmac } from 'node:crypto';
import { chromium } from '@playwright/test';

const APP = 'https://app.topiadesk.localhost';
const USER = 'admin';
const SEED_PW = 'ChangeMe!Admin1';
const NEW_PW = 'NewAdmin!Pass123';

function log(...args) {
  console.log('[verify-admin]', ...args);
}

function generateTotpCode(rawSecret, timestamp = Date.now(), period = 30, digits = 6) {
  const key = Buffer.from(rawSecret, 'utf8');
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

async function submitCredentials(page, username, password) {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 60_000 }), page.locator('#kc-login').click()]);
}

async function login(page) {
  await page.goto(`${APP}/api/auth/login`);
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/u);
  await submitCredentials(page, USER, SEED_PW);
  const stillOnLoginForm = (await page.locator('#username').count()) > 0 && (await page.locator('#password').count()) > 0;
  if (stillOnLoginForm) await submitCredentials(page, USER, NEW_PW);

  let storedSecret;
  for (let i = 0; i < 6; i++) {
    if (page.url().startsWith(APP)) return;

    const hasNewPasswordField = await page.locator('#password-new').isVisible().catch(() => false);
    if (hasNewPasswordField) {
      await page.locator('#password-new').fill(NEW_PW);
      await page.locator('#password-confirm').fill(NEW_PW);
      await page.locator('#kc-submit').click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    const hasTotpSecret = (await page.locator('#totpSecret').count()) > 0;
    if (hasTotpSecret) {
      storedSecret = await page.locator('#totpSecret').getAttribute('value');
      await page.locator('#userLabel').fill('Verify');
      await page.locator('#totp').fill(generateTotpCode(storedSecret));
      await page.locator('#saveTOTPBtn').click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    const hasOtpChallenge = (await page.locator('#otp').count()) > 0;
    if (hasOtpChallenge) {
      if (!storedSecret) throw new Error('OTP challenge with no known secret — admin may already be configured under a different secret.');
      await page.locator('#otp').fill(generateTotpCode(storedSecret));
      await page.locator('#kc-login').click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    const backAtPlainLogin = (await page.locator('#username').count()) > 0 && (await page.locator('#password').count()) > 0;
    if (backAtPlainLogin) {
      await submitCredentials(page, USER, NEW_PW);
      continue;
    }

    throw new Error(`Unrecognized Keycloak page at ${page.url()}`);
  }
  await page.waitForURL((url) => url.origin === APP, { timeout: 15_000 });
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

try {
  await login(page);
  log('logged in as admin, at', page.url());

  const kase = await api(page, 'POST', '/api/cases', {
    caseType: 'SERVICE_REQUEST',
    subject: `Admin verification case ${Date.now()}`,
    priority: 'MEDIUM',
  });
  assert(kase.status === 201 || kase.status === 200, `create case as admin (got ${kase.status}: ${JSON.stringify(kase.json).slice(0, 300)})`);
  const caseId = kase.json.id;
  log('created case', kase.json.caseNumber, caseId);

  const open = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'OPEN' });
  assert(open.json.status === 'OPEN', `case NEW->OPEN (got ${JSON.stringify(open.json).slice(0, 200)})`);

  const pending = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'PENDING_CARRIER' });
  assert(pending.json.status === 'PENDING_CARRIER', 'case OPEN->PENDING_CARRIER');
  const backToOpen = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'OPEN' });
  assert(backToOpen.json.status === 'OPEN', 'case PENDING_CARRIER->OPEN');

  const badTransition = await api(page, 'POST', `/api/cases/${caseId}/status`, { status: 'CLOSED' });
  // OPEN -> CLOSED IS actually valid per CASE_STATUS_TRANSITIONS (OPEN: [...,'CLOSED']) — use a genuinely invalid one instead.
  log('OPEN->CLOSED result (expected to succeed, is a valid transition):', badTransition.status, JSON.stringify(badTransition.json).slice(0, 150));

  const macro = await api(page, 'POST', '/api/macros', {
    name: `Admin verify macro ${Date.now()}`,
    entityType: 'CASE',
    actions: [
      { actionType: 'SET_PRIORITY', params: { priority: 'URGENT' } },
      { actionType: 'ADD_INTERNAL_NOTE', params: { subject: 'Macro note', body: 'Applied by admin verification macro' } },
    ],
  });
  assert(macro.status === 201 || macro.status === 200, `create macro (got ${macro.status}: ${JSON.stringify(macro.json).slice(0, 200)})`);
  const macroId = macro.json.id;

  // fresh case for the macro/apply-macro check (the CLOSED one above is terminal-ish)
  const kase2 = await api(page, 'POST', '/api/cases', { caseType: 'ENQUIRY', subject: `Macro target case ${Date.now()}` });
  const preview = await api(page, 'POST', `/api/macros/${macroId}/preview`, { entityType: 'CASE', entityId: kase2.json.id });
  assert(preview.status === 201 || preview.status === 200, `macro preview (got ${preview.status}: ${JSON.stringify(preview.json).slice(0, 200)})`);
  log('preview changes:', JSON.stringify(preview.json.changes));

  const applied = await api(page, 'POST', `/api/cases/${kase2.json.id}/apply-macro/${macroId}`);
  assert(applied.status === 201 || applied.status === 200, `apply macro (got ${applied.status}: ${JSON.stringify(applied.json).slice(0, 300)})`);

  const after = await api(page, 'GET', `/api/cases/${kase2.json.id}`);
  assert(after.json.priority === 'URGENT', `macro applied SET_PRIORITY (got ${after.json.priority})`);

  const comments = await api(page, 'GET', `/api/cases/${kase2.json.id}/comments`);
  assert(comments.json.some((c) => c.subject === 'Macro note'), 'macro applied ADD_INTERNAL_NOTE (comment visible)');

  // queue + self-assign
  const queueCase = await api(page, 'POST', '/api/cases', { caseType: 'ENQUIRY', subject: `Queue verify ${Date.now()}` });
  const queue = await api(page, 'GET', '/api/cases/queue');
  assert(queue.json.some((c) => c.id === queueCase.json.id), 'unassigned case appears in the queue endpoint');
  const claimed = await api(page, 'POST', `/api/cases/${queueCase.json.id}/claim`);
  assert(Boolean(claimed.json.assignedToId), `POST /cases/:id/claim self-assigns (assignedToId=${claimed.json.assignedToId})`);

  // link-child / merge
  const child = await api(page, 'POST', '/api/cases', { caseType: 'ENQUIRY', subject: `Child case ${Date.now()}` });
  const linked = await api(page, 'POST', `/api/cases/${caseId}/link-child`, { childCaseId: child.json.id });
  assert(linked.status === 200 || linked.status === 201, `link-child (got ${linked.status})`);
  const childAfter = await api(page, 'GET', `/api/cases/${child.json.id}`);
  assert(childAfter.json.parentCaseId === caseId, 'child case now has parentCaseId set');

  const mergeTarget = await api(page, 'POST', '/api/cases', { caseType: 'ENQUIRY', subject: `Merge target ${Date.now()}` });
  const merged = await api(page, 'POST', `/api/cases/${child.json.id}/merge`, { targetCaseId: mergeTarget.json.id });
  assert(merged.status === 200 || merged.status === 201, `merge (got ${merged.status})`);
  assert(merged.json.linkType === 'MERGED' && merged.json.status === 'CLOSED', `merge result is MERGED+CLOSED (got ${merged.json.linkType}/${merged.json.status})`);

  // ---- case detail page renders through the browser ----------------------
  await page.goto(`${APP}/cases/${kase2.json.id}`);
  await page.waitForLoadState('networkidle');
  const body = await page.locator('body').textContent();
  assert(body.includes(kase2.json.caseNumber), `case detail page shows ${kase2.json.caseNumber}`);
  assert(body.includes('Urgent'), 'case detail shows Urgent priority badge');
  assert(body.includes('Macro note'), 'case detail shows the macro-added comment');

  // ---- SLA policies / assignment rules CRUD (admin has sla_config:ALL) --
  const calendars = await api(page, 'GET', '/api/business-hours');
  log('business-hours-calendars ->', calendars.status, Array.isArray(calendars.json) ? `${calendars.json.length} rows` : calendars.json);

  const slaPolicy = await api(page, 'POST', '/api/sla-policies', {
    name: `Verify SLA ${Date.now()}`,
    entityType: 'CASE',
    priority: 'URGENT',
    targets: [{ metricType: 'RESOLUTION', targetMinutes: 240 }],
  });
  assert(slaPolicy.status === 200 || slaPolicy.status === 201, `create SLA policy (got ${slaPolicy.status}: ${JSON.stringify(slaPolicy.json).slice(0, 200)})`);
  assert(slaPolicy.json.targets?.length === 1, `SLA policy created with inline target (${slaPolicy.json.targets?.length} targets)`);

  const rule = await api(page, 'POST', '/api/assignment-rules', {
    name: `Verify rule ${Date.now()}`,
    entityType: 'CASE',
    strategy: 'ROUND_ROBIN',
    conditions: {},
  });
  assert(rule.status === 200 || rule.status === 201, `create assignment rule (got ${rule.status}: ${JSON.stringify(rule.json).slice(0, 200)})`);
  const tested = await api(page, 'POST', `/api/assignment-rules/${rule.json.id}/test`);
  assert(tested.status === 200 || tested.status === 201, `test assignment rule (got ${tested.status}: ${JSON.stringify(tested.json).slice(0, 200)})`);
  log('assignment rule test result:', JSON.stringify(tested.json));

  await page.goto(`${APP}/sla-policies`);
  await page.waitForLoadState('networkidle');
  const slaBody = await page.locator('body').textContent();
  assert(slaBody.includes(slaPolicy.json.name), 'SLA policies page lists the newly created policy');

  await page.goto(`${APP}/assignment-rules`);
  await page.waitForLoadState('networkidle');
  const ruleBody = await page.locator('body').textContent();
  assert(ruleBody.includes(rule.json.name), 'assignment rules page lists the newly created rule');

  log('ALL ADMIN-SIDE CHECKS PASSED');
} finally {
  await browser.close();
}
