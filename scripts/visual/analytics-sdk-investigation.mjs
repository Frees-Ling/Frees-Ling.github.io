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
  const candidate = await (await fetch(`${base}/blog-analytics.js`)).text();
  const baseline = await (await fetch(`${origin}/blog-analytics.js`)).text();
  for (const [variant, source] of [
    ['production-baseline', baseline],
    ['candidate', candidate],
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
        referer: 'https://referrer.example/source?qa=private',
      });
      assert.equal(result.sdkRequests, 0);
      assert.equal(result.collections.length, 0);
      phase = 'after-explicit-consent';
      await page.click(
        '[data-blog-analytics-banner] [data-blog-analytics-choice="granted"]',
      );
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 });
      result.cookies = (await context.cookies()).map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        expires: cookie.expires,
      }));
      result.cookieNames = result.cookies.map((cookie) => cookie.name);
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
      if (variant === 'candidate') {
        assert.equal(result.cleanPageView, true);
        assert.equal(result.ownCookie, true);
        assert.equal(
          result.pageViews[0].pageReferrer,
          'https://referrer.example',
        );
        assert.equal(result.sdkRequests, 1);
        assert.equal(result.error, undefined);
        for (const cookie of result.cookies) {
          assert.ok(cookie.name.startsWith('fl_blog_ga'));
          assert.equal(cookie.domain, 'frees-ling.dev');
          assert.equal(cookie.secure, true);
          assert.equal(cookie.sameSite, 'Lax');
          assert.ok(cookie.expires > Date.now() / 1000);
          assert.ok(cookie.expires <= Date.now() / 1000 + 180 * 86400 + 5);
        }
        await page.evaluate(() => {
          document.cookie =
            '_ga=preserved-fixture; Path=/; Domain=frees-ling.dev; Secure';
          document.cookie =
            '_ga_005T1QD6Z3=legacy-fixture; Path=/; Domain=frees-ling.dev; Secure';
        });
        await page.click('.privacy-pref-button');
        await page.waitForSelector('#fl-privacy-modal[open]');
        phase = 'after-withdrawal';
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }),
          page.click('#fl-privacy-modal [data-blog-analytics-choice="denied"]'),
        ]);
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 });
        assert.equal(result.sdkRequests, 1);
        assert.deepEqual(
          result.collections.filter((entry) => entry.phase === phase),
          [],
        );
        const remaining = (await context.cookies()).map(
          (cookie) => cookie.name,
        );
        assert.ok(remaining.includes('_ga'));
        assert.ok(!remaining.includes('_ga_005T1QD6Z3'));
        assert.ok(!remaining.some((name) => name.startsWith('fl_blog_ga')));
        result.withdrawal = 'PASS';
      }
    } finally {
      await context.close();
    }
  }
  assert.ok(
    results.some(
      (result) =>
        result.variant === 'candidate' && result.withdrawal === 'PASS',
    ),
    'The exact candidate must satisfy the privacy and withdrawal requirements',
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
