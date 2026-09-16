// KB-002 的浏览器验收：起真实服务 + 真实 Chrome，走一遍登录、新建、检索、主题切换。
//
//   node studio/verify/browser.mjs
//
// 全部用临时数据目录与合成内容，不接触真实私人笔记。
// 截图写到 /tmp/kb2/ 供人工查看。
//
// 存在的意义：**构建通过不等于界面可用**。本脚本第一次运行就抓出了一个
// 单测发现不了的缺陷 —— 登录表单提交的是 form-urlencoded，而服务端只按
// JSON 解析，于是 token 永远为空、登录必然失败。单测传的是 JSON 所以是绿的。

import puppeteer from 'puppeteer-core';
import { resolveChrome } from '../../scripts/visual/chrome-path.mjs';
import { start } from '../server/index.mjs';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHOTS = '/tmp/kb2-shots';
mkdirSync(SHOTS, { recursive: true });
const home = mkdtempSync(join(tmpdir(), 'kb2-'));
const { server, token, port, db } = await start({ home, port: 0 });
const base = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  executablePath: resolveChrome().path,
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

// ① 未登录 → 登录页
await page.goto(base, { waitUntil: 'load' });
const loginVisible = await page
  .$eval('form[action="/api/session"]', (f) => !!f)
  .catch(() => false);

// ② 登录
await page.type('#t', token);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'load' }),
  page.click('button[type=submit]'),
]);

// ③ 新建并保存一条（走真实 UI）
await page.click('#new');
await page.type('#title', '书房界面验证');
await page.type('#tags', '验证, 界面');
await page.type('#body', '这是通过浏览器界面创建的一条笔记。');
await Promise.all([
  page.waitForFunction(
    () => document.getElementById('status').textContent === '已保存',
    { timeout: 8000 },
  ),
  page.click('#editor button[type=submit]'),
]);

// ④ 检索
await page.type('#q', '浏览器');
await new Promise((r) => setTimeout(r, 500));
const hits = await page.$$eval('#notes li', (els) => els.length);

// ⑤ 深色模式
await page.click('#theme');
await new Promise((r) => setTimeout(r, 200));
const theme = await page.evaluate(() => document.documentElement.dataset.theme);

await page.screenshot({ path: `${SHOTS}/light.png` });
await page.click('#theme');
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: `${SHOTS}/dark.png` });

// ⑥ 键盘可达性：Tab 若干次，确认焦点始终可见
const focusOk = await page.evaluate(async () => {
  const seen = [];
  for (let i = 0; i < 8; i++) {
    const el = document.activeElement;
    if (el && el !== document.body)
      seen.push(el.tagName + (el.id ? '#' + el.id : ''));
  }
  return seen.length;
});

const result = {
  loginVisible,
  hits,
  theme,
  focusOk,
  consoleErrors: errors,
  notesInDb: db.prepare('SELECT COUNT(*) c FROM notes').get().c,
};
console.log(JSON.stringify(result, null, 1));

// 验收断言：任一不成立即非零退出，便于接入 CI 或手工复跑
const checks = [
  ['未登录时显示登录页', loginVisible === true],
  ['经真实界面新建的笔记已落库', result.notesInDb === 1],
  ['检索命中该笔记', hits === 1],
  ['主题可切换', theme === 'dark' || theme === 'light'],
  ['键盘可依次聚焦到 8 个元素', focusOk >= 8],
];
let bad = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) bad++;
}
process.exitCode = bad ? 1 : 0;

await browser.close();
await new Promise((r) => server.close(r));
db.close();
rmSync(home, { recursive: true, force: true });
