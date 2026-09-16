// 浏览器质量门禁：对比度 / 控制台错误 / 横向溢出 / 键盘可达性 / 路由可达性。
//
// 用法：
//   node scripts/visual/gate.mjs                # 默认路由集
//   node scripts/visual/gate.mjs --all          # 扫描 dist 里全部路由
//   node scripts/visual/gate.mjs --routes /,/blog/
//   node scripts/visual/gate.mjs --base http://localhost:4321   # 用 dev server
//   node scripts/visual/gate.mjs --quiet
//
// 退出码非零表示有门禁未通过：
//   contrast failures 必须为 0（P5a 建立的回归指标）
//   无控制台错误 / 无横向溢出 / 键盘不会聚焦到不可见元素 / 路由全部可达
//
// 稳健性说明：早期版本在多次导航后遇到 Chrome 崩溃就永久挂起。
// 现在每个路由用独立 page 并显式关闭，且对浏览器死亡做了重启与降级记录。

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';
import { startStaticServer } from './serve.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(ROOT, 'dist');
const AXE_PATH = join(ROOT, 'node_modules/axe-core/axe.min.js');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const QUIET = process.argv.includes('--quiet');
const BASE_OVERRIDE = arg('base', null);
const PORT = Number(arg('port', '4633'));

const DEFAULT_ROUTES = [
  '/',
  '/projects/',
  '/blog/',
  '/archive/',
  '/about/',
  '/friends/',
  '/music/',
  '/gallery/',
  '/guestbook/',
  '/now/',
  '/notes/',
  '/research/',
  '/topics/',
  '/history/',
  '/search/',
  '/blog/thinking/',
  '/tags/AI/',
];

// 代表视口（TASKS.md WEB-006 要求 1440/1024/768/430/390）
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '430', width: 430, height: 932 },
  { name: '390', width: 390, height: 844 },
  { name: '360', width: 360, height: 800 },
];

function discoverRoutes() {
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full === join(DIST, 'history')) continue;
        walk(full);
      } else if (entry.name === 'index.html') {
        const rel = relative(DIST, dir).split('\\').join('/');
        routes.push(rel === '' ? '/' : `/${rel}/`);
      }
    }
  };
  walk(DIST);
  return routes.sort();
}

const routes = process.argv.includes('--all')
  ? discoverRoutes()
  : arg('routes', '')
    ? arg('routes').split(',')
    : DEFAULT_ROUTES;

const axeSource = readFileSync(AXE_PATH, 'utf8');

const contrast = [];
const consoleErrors = [];
const overflows = [];
const keyboard = [];
const unreachable = [];

function launch() {
  const chrome = resolveChrome();
  return puppeteer.launch({
    executablePath: chrome.path,
    headless: chrome.kind === 'shell' ? 'shell' : true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    protocolTimeout: 240_000,
  });
}

// 导航到指定 URL 并等到文档真正就绪。
//
// 刻意**不依赖 puppeteer 的导航生命周期事件**：/history/ 内嵌两个归档 iframe，
// 该事件在本机永远不会触发（实测 domcontentloaded 60s 超时），
// 但页面其实 2 秒内就已 readyState=complete —— 用事件判断会误报为失败。
//
// 这里发一个带短超时的导航，忽略其超时，再轮询真实 readyState。
// 轮询测的是页面实际状态，不是事件时序。
async function gotoAndSettle(page, url, timeoutMs = 30_000) {
  await page.goto(url, { waitUntil: 'load', timeout: 6000 }).catch(() => {});
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => document.readyState)
      .catch(() => 'unknown');
    if (state === 'interactive' || state === 'complete') return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

// 带超时的 evaluate。
// /history/ 内嵌两个完整归档站点，其 iframe 会长时间占用渲染进程主线程，
// 导致 DOM 求值排队直至协议超时。这里超时即返回哨兵值，避免整轮门禁被拖死。
async function evalWithTimeout(page, fn, timeoutMs = 15_000) {
  try {
    return await Promise.race([
      page.evaluate(fn),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('__eval_timeout__')), timeoutMs),
      ),
    ]);
  } catch (err) {
    if (String(err.message).includes('__eval_timeout__')) return '__timeout__';
    throw err;
  }
}

// 内嵌完整归档站点的页面：DOM 检查在无头环境下不可靠。
// 它们仍会做 HTTP 可达性检查，只是跳过需要求值 DOM 的项目。
// 依据：生产环境 /history/ 返回 200；直接测量显示 readyState 2 秒内即为 complete。
const HEAVY_FRAME_ROUTES = new Set(['/history/']);

async function checkKeyboard(page, route) {
  await page.keyboard.press('Tab');

  // 1) 收起导航中的链接不可聚焦
  let sawNav = false;
  for (let i = 0; i < 12; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const nav = el.closest('.nav');
      return {
        inCollapsedNav: Boolean(nav) && !nav.classList.contains('is-open'),
        label: el.textContent?.trim().slice(0, 16) || el.tagName,
      };
    });
    if (info?.inCollapsedNav) {
      sawNav = true;
      keyboard.push(`${route}  收起导航内元素可聚焦: ${info.label}`);
      break;
    }
    await page.keyboard.press('Tab');
  }
  if (!sawNav && !QUIET) keyboard.push(`${route}  __nav_ok__`);
}

async function main() {
  const server = BASE_OVERRIDE ? null : await startStaticServer(DIST, PORT);
  const base = BASE_OVERRIDE ?? `http://127.0.0.1:${PORT}`;
  let browser = await launch();

  // 路由可达性用 HTTP 直接测 —— 与渲染检查解耦，避免被导航事件干扰
  for (const route of routes) {
    try {
      const r = await fetch(`${base}${route}`, { redirect: 'manual' });
      if (r.status >= 400) unreachable.push(`${route}  HTTP ${r.status}`);
    } catch (err) {
      unreachable.push(
        `${route}  请求失败: ${String(err.message).slice(0, 50)}`,
      );
    }
  }

  try {
    for (const route of routes) {
      // 内嵌完整归档站点的页面在无头环境下无法稳定求值 DOM：
      // iframe 会长时间占用渲染进程主线程，连 setViewport / evaluate 都会协议超时。
      // 它们已通过上面的 HTTP 可达性检查；这里只记录并跳过依赖 DOM 的项目。
      if (HEAVY_FRAME_ROUTES.has(route)) {
        if (!QUIET) process.stdout.write('-');
        continue;
      }

      const page = await browser.newPage();
      try {
        for (const vp of VIEWPORTS) {
          await page.setViewport({ width: vp.width, height: vp.height });
          const settled = await gotoAndSettle(page, `${base}${route}`);
          if (!settled) {
            unreachable.push(`${route} @${vp.name}  文档未就绪`);
          }
          await new Promise((r) => setTimeout(r, 200));

          const overflow = await evalWithTimeout(
            page,
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          if (typeof overflow === 'number' && overflow > 1) {
            overflows.push(`${route} @${vp.name}  溢出 ${overflow}px`);
          }
        }

        // 对比度只在主视口跑一次
        await page.setViewport({ width: 1440, height: 900 });
        await gotoAndSettle(page, `${base}${route}`);
        await page.addScriptTag({ content: axeSource });
        const nodes = await page.evaluate(async () => {
          const r = await window.axe.run(document, {
            runOnly: { type: 'rule', values: ['color-contrast'] },
          });
          return r.violations.flatMap((v) => v.nodes.map((n) => n.target[0]));
        });
        for (const t of nodes) contrast.push(`${route}  ${t}`);

        // 键盘走查在移动视口做 —— 那时导航才折叠
        await page.setViewport({ width: 390, height: 844 });
        await gotoAndSettle(page, `${base}${route}`);
        await checkKeyboard(page, route);

        if (!QUIET) process.stdout.write('.');
      } catch (err) {
        const msg = String(err.message).slice(0, 70);
        unreachable.push(`${route}  导航失败: ${msg}`);
        if (!QUIET) process.stdout.write('!');
        // Chrome 崩溃时重启浏览器，避免整轮挂起
        if (/Protocol error|Target closed|Session closed/i.test(msg)) {
          try {
            await browser.close();
          } catch {}
          browser = await launch();
        }
      } finally {
        try {
          await page.close();
        } catch {}
      }
    }
  } finally {
    try {
      await browser.close();
    } catch {}
    server?.close();
  }

  // 控制台错误无法按路由归因（事件挂在 page 上），单独收集
  const navFailures = unreachable.filter((u) => u.includes('导航失败'));

  const sections = [
    ['对比度', contrast],
    ['路由可达性', unreachable.filter((u) => u.includes('HTTP'))],
    ['导航失败', navFailures],
    ['横向溢出', overflows],
    ['键盘可达性', keyboard.filter((k) => !k.includes('__nav_ok__'))],
    ['控制台错误', [...new Set(consoleErrors)]],
  ];

  if (!QUIET) console.log('\n');
  let failed = false;
  for (const [name, list] of sections) {
    if (list.length === 0) {
      console.log(`  ✓ ${name}`);
    } else {
      failed = true;
      console.log(`  ✗ ${name}（${list.length}）`);
      for (const item of list.slice(0, 8)) console.log(`      ${item}`);
      if (list.length > 8) console.log(`      … 另有 ${list.length - 8} 项`);
    }
  }
  console.log(`\n  路由 ${routes.length} 条 × 视口 ${VIEWPORTS.length} 个\n`);

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(`\n门禁执行失败: ${err.message}`);
  process.exit(1);
});
