// Real public SDK, isolated built pages, and intercepted collection requests.
// This experiment does not prove production delivery or GA4 ingestion.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';
import { startStaticServer } from './serve.mjs';

assert.equal(process.env.ANALYTICS_SDK_INVESTIGATION, 'true');
const origin = 'https://frees-ling.dev';
const base = 'http://127.0.0.1:4637';
const folder = 'test-results/analytics-sdk-investigation';
const server = await startStaticServer('dist', 4637);
const results = [];
let browser;
try {
  await mkdir(folder, { recursive: true });
  browser = await puppeteer.launch({
    executablePath: resolveChrome().path,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const original = await (await fetch(`${base}/blog-analytics.js`)).text();
  const granted = original
    .replace("analytics_storage: 'denied',", "analytics_storage: 'granted',")
    .replace(
      "    gtag('consent', 'update', { analytics_storage: 'granted' });",
      '',
    );
  assert.notEqual(granted, original);
  const scalar = original.replace(
    "    gtag('set', {",
    `    gtag('set', 'send_page_view', false);
    gtag('set', 'page_location', cleanLocation);
    gtag('set', 'page_referrer', cleanReferrer);
    gtag('set', 'cookie_prefix', COOKIE_PREFIX);
    gtag('set', {`,
  );
  assert.notEqual(scalar, original);
  const early = scalar
    .replace("    gtag('js', new Date());\n", '')
    .replace(
      "    gtag('config', measurementId, {",
      "    gtag('js', new Date());\n\n    gtag('config', measurementId, {",
    );
  assert.notEqual(early, scalar);
  for (const [variant, source] of [
    ['current', original],
    ['granted-only-after-explicit-choice', granted],
    ['explicit-global-overrides', scalar],
    ['global-overrides-before-js', early],
  ]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const result = { variant, collections: [], sdkRequests: 0, blocked: [] };
    results.push(result);
    let phase = 'before-consent';
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      try {
        const url = new URL(request.url());
        if (url.origin === origin) {
          if (url.pathname === '/blog-analytics.js') {
            await request.respond({
              status: 200,
              contentType: 'application/javascript',
              body: source,
            });
          } else {
            const response = await fetch(`${base}${url.pathname}`);
            await request.respond({
              status: response.status,
              contentType: response.headers.get('content-type') || 'text/plain',
              body: Buffer.from(await response.arrayBuffer()),
            });
          }
        } else if (
          url.hostname === 'www.googletagmanager.com' &&
          url.pathname === '/gtag/js' &&
          url.searchParams.get('id') === 'G-005T1QD6Z3'
        ) {
          result.sdkRequests++;
          await request.continue();
        } else if (
          /(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(
            url.hostname,
          ) &&
          url.pathname === '/g/collect'
        ) {
          for (const line of (request.postData() || '').split('\n')) {
            const params = new URLSearchParams(url.searchParams);
            for (const [key, value] of new URLSearchParams(line))
              params.set(key, value);
            result.collections.push({
              phase,
              event: params.get('en'),
              pageLocation: params.get('dl'),
              pageReferrer: params.get('dr'),
            });
          }
          // Never transmit diagnostic collection payloads to Google.
          await request.respond({ status: 204, body: '' });
        } else {
          result.blocked.push({ host: url.hostname, path: url.pathname });
          await request.abort();
        }
      } catch (error) {
        result.error = error.message;
        await request.abort().catch(() => {});
      }
    });
    try {
      await page.goto(`${origin}/topics/?qa=sdk-investigation#verification`, {
        waitUntil: 'networkidle0',
      });
      assert.equal(result.sdkRequests, 0);
      assert.equal(result.collections.length, 0);
      phase = 'after-explicit-consent';
      await page.click(
        '[data-blog-analytics-banner] [data-blog-analytics-choice="granted"]',
      );
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 });
      result.cookieNames = (await context.cookies()).map(
        (cookie) => cookie.name,
      );
      result.commands = await page.evaluate(() =>
        (window.dataLayer || [])
          .map((entry) => Array.from(entry))
          .filter((entry) =>
            ['config', 'event', 'set', 'consent'].includes(entry[0]),
          )
          .map((entry) => ({
            command: entry[0],
            name: typeof entry[1] === 'string' ? entry[1] : 'object',
            pageLocation: entry[2]?.page_location || entry[1]?.page_location,
            cookiePrefix: entry[2]?.cookie_prefix,
            sendPageView: entry[2]?.send_page_view,
          })),
      );
      result.pageViews = result.collections.filter(
        (entry) => entry.event === 'page_view',
      );
      result.cleanPageView =
        result.pageViews.length === 1 &&
        result.pageViews[0].pageLocation === `${origin}/topics/`;
      result.ownCookie = result.cookieNames.some((name) =>
        name.startsWith('fl_blog_ga'),
      );
    } finally {
      await context.close();
    }
  }
  assert.ok(
    results.some((result) => result.cleanPageView && result.ownCookie),
    'At least one initialization must satisfy both original privacy requirements',
  );
} finally {
  await writeFile(
    `${folder}/evidence.json`,
    JSON.stringify({ collection: 'INTERCEPTED_NOT_SENT', results }, null, 2) +
      '\n',
  );
  await browser?.close();
  server.close();
}
