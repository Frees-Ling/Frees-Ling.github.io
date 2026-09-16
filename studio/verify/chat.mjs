// KB-004 的浏览器验收：起真实服务 + 真实 Chrome + 模拟推理服务，
// 走一遍「新建对话 → 提问 → 收到带引用的回答 → 存为草稿」。
//
//   node studio/verify/chat.mjs
//
// 用模拟推理服务而非真实模型 —— 验收的是**链路**，
// 不是回答质量（模拟服务不产生有意义的回答）。

import puppeteer from 'puppeteer-core';
import { resolveChrome } from '../../scripts/visual/chrome-path.mjs';
import { start } from '../server/index.mjs';
import { startMockServer } from '../ai/mock.mjs';
import { createProvider } from '../ai/provider.mjs';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOTS = '/tmp/kb4-shots';
mkdirSync(SHOTS, { recursive: true });

const mock = await startMockServer();
const home = mkdtempSync(join(tmpdir(), 'kb4-'));
const provider = createProvider({ baseUrl: mock.baseUrl, model: 'mock-model' });
const { server, token, port, db } = await start({ home, port: 0, provider });
const base = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({
  executablePath: resolveChrome().path,
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// 只记**脚本异常**。资源加载失败（缺图标之类）是噪音，
// 与「界面能不能用」无关，混在一起会让这条断言失去意义。
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t)) return;
  errors.push(`console: ${t}`);
});
const seen = [];
const badResponses = [];
page.on('response', async (r) => {
  const line = `${r.request().method()} ${r.url().replace(base, '')} → ${r.status()}`;
  if (r.url().includes('/api/')) seen.push(line);
  if (r.status() >= 400) badResponses.push(line);
});

// 登录
await page.goto(base, { waitUntil: 'load' });
await page.type('#t', token);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'load' }),
  page.click('button[type=submit]'),
]);

// 先建一条笔记，供检索命中
await page.click('#new');
await page.type('#title', '线性代数与注意力机制');
await page.type('#body', '从几何直觉出发理解注意力');
await Promise.all([
  page.waitForFunction(
    () => document.getElementById('status').textContent === '已保存',
    { timeout: 8000 },
  ),
  page.click('#editor button[type=submit]'),
]);

// 切到对话
await page.click('#tab-chat');
await page.waitForFunction(() => !document.getElementById('view-chat').hidden, {
  timeout: 5000,
});
await page
  .waitForFunction(
    () => {
      const el = document.getElementById('model-status');
      return (
        el &&
        (el.classList.contains('online') || el.classList.contains('offline'))
      );
    },
    { timeout: 8000 },
  )
  .catch(() => {});
const modelOk = await page.$eval('#model-status', (el) =>
  el.classList.contains('online'),
);

await page.click('#new-conv');
await page.type('#prompt', '注意力机制');
await page.click('#send');
await page
  .waitForFunction(
    () => document.querySelectorAll('#messages .msg').length >= 2,
    { timeout: 15000 },
  )
  .catch(() => {});

const msgCount = await page.$$eval('#messages .msg', (els) => els.length);
if (msgCount < 2) {
  console.log(
    JSON.stringify(
      {
        diagnostics: {
          apiCalls: seen,
          badResponses,
          messagesHtml: await page.$eval('#messages', (el) =>
            el.innerHTML.slice(0, 600),
          ),
          pageErrors: errors,
        },
      },
      null,
      1,
    ),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
  await mock.close();
  db.close();
  rmSync(home, { recursive: true, force: true });
  process.exit(1);
}
const citeCount = await page.$$eval(
  '#messages .msg-cites li',
  (els) => els.length,
);

await page.click('#messages .msg-actions button');
await page.waitForFunction(() => window.__lastDraft, { timeout: 8000 });
const draftId = await page.evaluate(() => window.__lastDraft);
const draft = db
  .prepare('SELECT origin, status, title FROM notes WHERE id = ?')
  .get(draftId);

await page.screenshot({ path: `${SHOTS}/chat.png` });

const result = {
  apiCalls: seen,
  messages: await page.$$eval('#messages .msg', (els) =>
    els.map((e) => e.textContent.slice(0, 60)),
  ),
  modelOk,
  msgCount,
  citeCount,
  draftOrigin: draft.origin,
  draftStatus: draft.status,
  pageErrors: errors,
};
console.log(JSON.stringify(result, null, 1));

const checks = [
  ['模型端点探活成功', modelOk === true],
  ['提问后产生用户与助手两条消息', msgCount >= 2],
  ['回答带上了知识库引用', citeCount >= 1],
  ['存为草稿后带 ai_draft 标记', draft.origin === 'ai_draft'],
  ['草稿状态为 draft，未自动成为已确认内容', draft.status === 'draft'],
  ['无脚本异常', errors.length === 0],
];
let bad = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) bad++;
}
process.exitCode = bad ? 1 : 0;

await browser.close();
await new Promise((r) => server.close(r));
await mock.close();
db.close();
rmSync(home, { recursive: true, force: true });
