import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';
import { startStaticServer } from './serve.mjs';

const port = 4635;
const base = `http://127.0.0.1:${port}`;
const server = await startStaticServer('dist', port);
let browser;
try {
  const chrome = resolveChrome();
  browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const axe = await readFile('node_modules/axe-core/axe.min.js', 'utf8');
  for (const width of [390, 1280]) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height: 900 });
        await page.emulateMediaFeatures([
          { name: 'prefers-color-scheme', value: theme },
        ]);
        await page.evaluateOnNewDocument(() =>
          localStorage.setItem('fl_consent_v2', 'granted'),
        );
        const vendors = [];
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const target = new URL(req.url());
          // Embedded data: artwork is not a transmission to a third party.
          if (
            ['http:', 'https:'].includes(target.protocol) &&
            target.origin !== base
          ) {
            vendors.push(req.url());
            void req.abort();
          } else void req.continue();
        });
        const response = await page.goto(`${base}/privacy/`, {
          waitUntil: 'networkidle0',
        });
        assert.equal(response.status(), 200);
        await page.focus('.privacy-pref-button');
        await page.keyboard.press('Enter');
        assert.equal(
          await page.$eval('#fl-privacy-modal', (el) => el.open),
          true,
        );
        assert.equal(
          await page.$eval(
            '#fl-privacy-modal button[autofocus]',
            (el) => document.activeElement === el,
          ),
          true,
        );
        assert.equal(
          await page.$eval(
            '#fl-privacy-modal',
            (el) => el.scrollWidth <= el.clientWidth,
          ),
          true,
        );
        await page.addScriptTag({ content: axe });
        const violations = await page.evaluate(
          async () =>
            (
              await window.axe.run(
                document.querySelector('#fl-privacy-modal'),
                {
                  runOnly: {
                    type: 'tag',
                    values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
                  },
                },
              )
            ).violations,
        );
        assert.deepEqual(
          violations.map((v) => v.id),
          [],
        );
        await page.keyboard.press('Escape');
        assert.equal(
          await page.$eval('#fl-privacy-modal', (el) => el.open),
          false,
        );
        assert.equal(
          await page.$eval(
            '.privacy-pref-button',
            (el) => document.activeElement === el,
          ),
          true,
        );
        assert.deepEqual(
          vendors,
          [],
          'Legacy local grant must not load any third-party SDK',
        );
        console.log(
          `PASS privacy dialog: ${width}px ${theme}, keyboard, focus, axe and no vendor requests`,
        );
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser?.close();
  server.close();
}
