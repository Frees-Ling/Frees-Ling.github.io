// Explicit owner-authorized production diagnostic, never a traffic-growth test.
// Uses real Google SDK/network responses; no account credentials or fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';

assert.equal(process.env.ANALYTICS_PRODUCTION_CHECK, 'true');
const origin = 'https://frees-ling.dev';
const measurementId = 'G-005T1QD6Z3';
const consentKey = 'fl-blog-analytics-consent-v1';
const approvedScriptHash =
  'bb02fbc9a2ed37b14bd0dd6431a60ef888a27bd0d0fcb2d637f1b0c44df0ff8a';
const folder = 'test-results/analytics-production';
await mkdir(folder, { recursive: true });
const evidence = {
  target: origin,
  measurementId,
  approvedCandidate: 'cd40424d42a0f17514db24335b78d06cf245f915',
  startedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  interpretation:
    'SDK/HTTP evidence only; GA4 ingestion and Google review are separate. This diagnostic is not organic traffic.',
};
let browser;
try {
  const script = await fetch(`${origin}/blog-analytics.js`);
  assert.equal(script.status, 200);
  const hash = createHash('sha256')
    .update(Buffer.from(await script.arrayBuffer()))
    .digest('hex');
  assert.equal(
    hash,
    approvedScriptHash,
    'Only the approved deployed script may be tested',
  );
  evidence.scriptHash = hash;
  browser = await puppeteer.launch({
    executablePath: resolveChrome().path,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const requests = [];
  const collections = [];
  const responses = [];
  const failures = [];
  evidence.googleRequests = requests;
  evidence.googleResponses = responses;
  evidence.networkFailures = failures;
  evidence.backendIngestion = 'NOT_VERIFIED';
  let phase = 'before-consent';
  const googleHost = (host) =>
    /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googleadservices\.com|googlesyndication\.com|google\.com)$/.test(
      host,
    );
  const isCollect = (request) => {
    const url = new URL(request.url());
    return (
      /(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(
        url.hostname,
      ) && url.pathname === '/g/collect'
    );
  };
  const records = (request) => {
    const base = new URL(request.url()).searchParams;
    return (request.postData() || '').split('\n').map((line) => {
      const params = new URLSearchParams(base);
      for (const [key, value] of new URLSearchParams(line))
        params.set(key, value);
      // Keep only public diagnostic fields; never retain CID, SID or cookies.
      return {
        event: params.get('en'),
        measurementId: params.get('tid'),
        pageLocation: params.get('dl'),
      };
    });
  };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (googleHost(url.hostname))
      requests.push({ phase, host: url.hostname, path: url.pathname });
    if (isCollect(request)) collections.push(...records(request));
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (googleHost(url.hostname))
      responses.push({
        phase,
        host: url.hostname,
        path: url.pathname,
        status: response.status(),
      });
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    failures.push({
      phase,
      host: url.hostname,
      path: url.pathname,
      error: request.failure()?.errorText,
    });
  });
  await page.goto(`${origin}/topics/?qa=analytics-release#verification`, {
    waitUntil: 'networkidle0',
  });
  assert.equal(requests.length, 0, 'No Google request before explicit consent');
  assert.equal(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith('fl_blog_'),
    ),
    false,
  );
  await page.screenshot({
    path: `${folder}/before-consent.png`,
    fullPage: true,
  });
  evidence.beforeConsent = 'PASS';
  const acknowledgement = page.waitForResponse(
    (response) =>
      isCollect(response.request()) &&
      records(response.request()).some(
        (record) =>
          record.measurementId === measurementId &&
          record.event === 'page_view',
      ),
    { timeout: 30000 },
  );
  phase = 'after-explicit-consent';
  const [receipt] = await Promise.all([
    acknowledgement,
    page.click(
      '[data-blog-analytics-banner] [data-blog-analytics-choice="granted"]',
    ),
  ]);
  assert.ok(
    [200, 204].includes(receipt.status()),
    'Real Google collection endpoint must acknowledge the request',
  );
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 });
  const views = collections.filter(
    (record) =>
      record.measurementId === measurementId && record.event === 'page_view',
  );
  assert.equal(
    views.length,
    1,
    'A diagnostic visit must not duplicate page_view',
  );
  evidence.sanitizedLocation =
    views[0].pageLocation === `${origin}/topics/` ? 'PASS' : 'FAIL';
  evidence.queuedPageViews = await page.evaluate(() =>
    (window.dataLayer || [])
      .map((entry) => Array.from(entry))
      .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view')
      .map((entry) => ({
        pageLocation: entry[2]?.page_location,
        pageReferrer: entry[2]?.page_referrer,
      })),
  );
  assert.equal(
    requests.some((request) =>
      /googleadservices|googlesyndication/.test(request.host),
    ),
    false,
  );
  assert.ok(
    requests.some(
      (request) =>
        request.host === 'www.googletagmanager.com' &&
        request.path === '/gtag/js',
    ),
  );
  assert.ok(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith('fl_blog_ga'),
    ),
  );
  evidence.explicitConsent = 'PASS';
  evidence.collectionHttpStatus = receipt.status();
  evidence.sanitizedPageView = views[0];
  await page.click('.privacy-pref-button');
  await page.waitForSelector('#fl-privacy-modal[open]');
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) phase = 'after-withdrawal-reload';
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('#fl-privacy-modal [data-blog-analytics-choice="denied"]'),
  ]);
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 });
  assert.deepEqual(
    requests.filter((request) => request.phase === 'after-withdrawal-reload'),
    [],
  );
  assert.equal(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith('fl_blog_ga'),
    ),
    false,
  );
  assert.equal(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).choice,
      consentKey,
    ),
    'denied',
  );
  await page.click('.privacy-pref-button');
  await page.screenshot({ path: `${folder}/withdrawn.png`, fullPage: true });
  evidence.withdrawal = 'PASS';
  evidence.googleRequests = requests;
  evidence.backendIngestion = 'NOT_VERIFIED';
  assert.equal(views[0].pageLocation, `${origin}/topics/`);
  evidence.status = 'PASS';
} catch (error) {
  evidence.status = 'FAIL';
  evidence.error = error.message;
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    `${folder}/evidence.json`,
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await browser?.close();
}
