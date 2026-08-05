import { chromium } from '@playwright/test';

const BASE = 'https://app.topiadesk.localhost';
const OUT = '/private/tmp/claude-501/-Users-geremoses-Desktop-Topia-Desk-CRM/785f4404-9375-451e-9faf-af90675b5333/scratchpad';

const REPORT_KEYS = [
  'lead-source-campaign-roi', // bar
  'premium-aging-by-branch', // stackedBar
  'policy-lapse-rate', // line
  'sales-pipeline-conversion-velocity', // funnel
  'broker-productivity', // table
  'account-portfolio-concentration', // treemap
  'document-compliance-readiness', // gauge
];

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  storageState: 'e2e/.auth/broker.json',
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle', timeout: 30000 });
console.log('Landed on:', page.url());
await page.screenshot({ path: `${OUT}/catalog.png`, fullPage: true });

if (page.url().startsWith(BASE)) {
  for (const key of REPORT_KEYS) {
    try {
      await page.goto(`${BASE}/reports/${key}`, { waitUntil: 'networkidle', timeout: 30000 });
      const runButton = page.getByRole('button', { name: /run report/i });
      await runButton.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/report-${key}.png`, fullPage: true });
      console.log('Captured', key);
    } catch (err) {
      console.log('FAILED', key, err.message);
    }
  }
} else {
  console.log('NOT AUTHENTICATED — landed on', page.url());
}

await browser.close();
