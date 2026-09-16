// 记忆审核的浏览器验收。
//
//   node studio/verify/memory.mjs
//
// 验收的是三层模型里最关键的那条约束：
// **AI 提取的记忆必须经人工确认才进入检索**。
// 若这条在界面上做不到，约束在实践中就被绕过了。

import puppeteer from 'puppeteer-core';
import { resolveChrome } from '../../scripts/visual/chrome-path.mjs';
import { start } from '../server/index.mjs';
import { startMockServer } from '../ai/mock.mjs';
import { createProvider } from '../ai/provider.mjs';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOTS = '/tmp/kb6-shots';
mkdirSync(SHOTS, { recursive: true });

const mock = await startMockServer();
const home = mkdtempSync(join(tmpdir(), 'kb6-'));
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

await page.goto(base, { waitUntil: 'load' });
await page.type('#t', token);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'load' }),
  page.click('button[type=submit]'),
]);

// 通过界面走一遍：建笔记 → 提问 → 提取记忆
await page.click('#new');
await page.type('#title', '注意力机制的几何直觉');
await Promise.all([
  page.waitForFunction(
    () => document.getElementById('status').textContent === '已保存',
    { timeout: 8000 },
  ),
  page.click('#editor button[type=submit]'),
]);

await page.click('#tab-chat');
await page.waitForFunction(() => !document.getElementById('view-chat').hidden, {
  timeout: 5000,
});
await page.click('#new-conv');
await page.type('#prompt', '注意力机制');
await page.click('#send');
await page.waitForFunction(
  () => document.querySelectorAll('#messages .msg-actions button').length > 0,
  { timeout: 15000 },
);

// 用界面按钮提取记忆（复用「存为草稿」旁边的机制不可用，故走 API 一次，
// 但审核动作全部在界面上完成 —— 那才是本脚本要验的部分）
// 对话 id 从 API 取：界面里点对话走的是 preventDefault，
// location.hash 不会变 —— 从 hash 读会拿到空串。
const convId = await page.evaluate(async () => {
  const r = await fetch('/api/conversations');
  return (await r.json()).conversations[0].id;
});
const messageId = await page.evaluate(async (id) => {
  const r = await fetch(`/api/conversations/${id}`);
  const d = await r.json();
  return d.conversation.messages.find((m) => m.role === 'assistant').id;
}, convId);
await page.evaluate(
  async ([id, mid]) => {
    await fetch(`/api/conversations/${id}/memories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messageId: mid,
        content: '注意力机制要先看几何直觉',
      }),
    });
  },
  [convId, messageId],
);

// ── 界面上的审核流程 ──
await page.click('#tab-memory');
await page.waitForFunction(
  () => document.querySelectorAll('#memories .msg').length > 0,
  { timeout: 8000 },
);
const pendingCount = await page.$$eval('#memories .msg', (els) => els.length);
const statusText = await page.$eval('#mem-status', (el) => el.textContent);

// 确认前：不出现在检索里
const beforeApprove = await page.evaluate(async () => {
  const r = await fetch(
    '/api/search-all?q=' + encodeURIComponent('注意力机制'),
  );
  return (await r.json()).memories.length;
});

// 点「查看来源」，来源链应显示
await page.click('#memories .msg-actions button:nth-child(3)');
await page.waitForFunction(() => document.querySelector('.provenance'), {
  timeout: 5000,
});
const provenanceText = await page.$eval('.provenance', (el) => el.textContent);

await page.screenshot({ path: `${SHOTS}/pending.png` });

// 点「确认」
await page.click('#memories .msg-actions button');
await page.waitForFunction(
  () => document.querySelectorAll('#memories .msg').length === 0,
  { timeout: 8000 },
);

const afterApprove = await page.evaluate(async () => {
  const r = await fetch(
    '/api/search-all?q=' + encodeURIComponent('注意力机制'),
  );
  return (await r.json()).memories.length;
});

// 已确认列表里应出现
await page.click('#mem-approved');
await page.waitForFunction(
  () => document.querySelectorAll('#memories .msg').length > 0,
  { timeout: 5000 },
);
const approvedCount = await page.$$eval('#memories .msg', (els) => els.length);

await page.screenshot({ path: `${SHOTS}/approved.png` });

const result = {
  pendingCount,
  statusText,
  beforeApprove,
  afterApprove,
  approvedCount,
  provenanceText,
  pageErrors: errors,
};
console.log(JSON.stringify(result, null, 1));

const checks = [
  ['待审核列表显示该记忆', pendingCount === 1],
  ['状态文案说明「确认后才进入检索」', /确认后/.test(statusText)],
  ['确认前不进入检索', beforeApprove === 0],
  ['来源链可查', /对话/.test(provenanceText)],
  ['确认后进入检索', afterApprove === 1],
  ['已确认列表可见', approvedCount === 1],
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
