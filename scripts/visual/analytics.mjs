// Browser contract tests use the real built pages and a local SDK fixture.
// All third-party requests are intercepted; this is not live GA4 acceptance.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';
import { startStaticServer } from './serve.mjs';

const origin = 'https://frees-ling.dev';
const base = 'http://127.0.0.1:4636';
const server = await startStaticServer('dist', 4636);
const consentKey = 'fl-blog-analytics-consent-v1';
let browser;
try {
  const chrome = resolveChrome();
  browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const axe = await readFile('node_modules/axe-core/axe.min.js', 'utf8');
  await mkdir('test-results/analytics', { recursive: true });
  for (const width of [390, 1280]) {
    for (const theme of ['dark', 'light']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const sdkRequests = [];
      const unexpected = [];
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewport({ width, height: 900 });
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: theme },
      ]);
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('fl_consent_v2', 'granted');
      });
      await page.setRequestInterception(true);
      page.on('request', async (req) => {
        try {
          const target = new URL(req.url());
          if (target.origin === origin) {
            const local = await fetch(`${base}${target.pathname}`);
            await req.respond({
              status: local.status,
              contentType: local.headers.get('content-type') || 'text/plain',
              body: Buffer.from(await local.arrayBuffer()),
            });
          } else if (
            target.origin === 'https://www.googletagmanager.com' &&
            target.pathname === '/gtag/js' &&
            target.searchParams.get('id') === 'G-005T1QD6Z3'
          ) {
            sdkRequests.push(req.url());
            await req.respond({
              status: 200,
              contentType: 'application/javascript',
              body: 'window.__analyticsSdkFixture = true;',
            });
          } else if (['http:', 'https:'].includes(target.protocol)) {
            unexpected.push(req.url());
            await req.abort();
          } else await req.continue();
        } catch (error) {
          errors.push(error.message);
          await req.abort().catch(() => {});
        }
      });
      try {
        await page.goto(
          `${origin}/topics/?email=test@example.invalid#private`,
          {
            waitUntil: 'networkidle0',
          },
        );
        assert.equal(sdkRequests.length, 0, 'legacy consent cannot load GA4');
        assert.equal(
          await page.$eval('[data-blog-analytics-banner]', (el) => el.hidden),
          false,
        );
        assert.equal(
          await page.$eval('body', (el) => el.scrollWidth <= el.clientWidth),
          true,
        );
        await page.addScriptTag({ content: axe });
        const violations = await page.evaluate(async () => {
          const result = await window.axe.run(
            document.querySelector('[data-blog-analytics-banner]'),
            {
              runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
              },
            },
          );
          return result.violations.map((v) => v.id);
        });
        assert.deepEqual(violations, []);
        await page.screenshot({
          path: `test-results/analytics/choice-${width}-${theme}.png`,
          fullPage: true,
        });
        await page.focus(
          '[data-blog-analytics-banner] [data-blog-analytics-choice="granted"]',
        );
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__analyticsSdkFixture === true);
        assert.equal(sdkRequests.length, 1);
        const commands = await page.evaluate(() =>
          window.dataLayer.map((entry) => Array.from(entry)),
        );
        const config = commands.find((entry) => entry[0] === 'config');
        const views = commands.filter(
          (entry) => entry[0] === 'event' && entry[1] === 'page_view',
        );
        assert.equal(config[1], 'G-005T1QD6Z3');
        assert.equal(config[2].send_page_view, false);
        assert.equal(config[2].allow_google_signals, false);
        assert.equal(config[2].allow_ad_personalization_signals, false);
        assert.equal(config[2].page_location, `${origin}/topics/`);
        assert.equal(views.length, 1);
        assert.equal(views[0][2].page_location, `${origin}/topics/`);
        assert.ok(!JSON.stringify(commands).includes('test@example.invalid'));
        assert.ok(!JSON.stringify(commands).includes('#private'));
        await page.focus('.privacy-pref-button');
        await page.keyboard.press('Enter');
        await page.click(
          '#fl-privacy-modal [data-blog-analytics-choice="granted"]',
        );
        assert.equal(
          sdkRequests.length,
          1,
          'repeated consent must not duplicate the SDK',
        );
        await page.evaluate(() => {
          document.cookie = 'fl_blog_ga=fixture; path=/; Secure';
          document.cookie = '_ga=hub-fixture; path=/; Secure';
        });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }),
          page.click('#fl-privacy-modal [data-blog-analytics-choice="denied"]'),
        ]);
        assert.equal(
          sdkRequests.length,
          1,
          'withdrawal reload must not restart GA4',
        );
        const after = await page.evaluate(
          (key) => ({
            consent: JSON.parse(localStorage.getItem(key)),
            cookie: document.cookie,
          }),
          consentKey,
        );
        assert.equal(after.consent.choice, 'denied');
        assert.ok(!after.cookie.includes('fl_blog_ga='));
        assert.ok(after.cookie.includes('_ga=hub-fixture'));
        assert.deepEqual(unexpected, []);
        assert.deepEqual(errors, []);
        console.log(
          `PASS analytics SDK fixture contract: ${width}px ${theme}, opt-in, sanitization, dedupe, withdrawal, axe`,
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  server.close();
}
