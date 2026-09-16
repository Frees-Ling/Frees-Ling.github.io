// 浏览器质量门禁：对比度 / 控制台错误 / 横向溢出 / 键盘可达性。
//
// 用法：
//   node scripts/visual/gate.mjs                # 默认路由集
//   node scripts/visual/gate.mjs --all          # 扫描 dist 里全部路由
//   node scripts/visual/gate.mjs --routes /,/blog/
//   node scripts/visual/gate.mjs --quiet
//
// 退出码非零表示有门禁未通过。这是提交前的硬性关卡：
//   contrast failures 必须为 0（P5a 建立的回归指标）
//   无控制台错误
//   无横向溢出
//   键盘不会聚焦到不可见元素

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';
import { startStaticServer } from './serve.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(ROOT, 'dist');
const AXE_PATH = join(ROOT, 'node_modules/axe-core/axe.min.js');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4633;
const QUIET = process.argv.includes('--quiet');

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
  '/history/',
  '/search/',
  '/blog/thinking/',
  '/tags/ai/',
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

function discoverAllRoutes() {
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

const argRoutes = process.argv.indexOf('--routes');
const routes = process.argv.includes('--all')
  ? discoverAllRoutes()
  : argRoutes !== -1
    ? process.argv[argRoutes + 1].split(',')
    : DEFAULT_ROUTES;

const axeSource = readFileSync(AXE_PATH, 'utf8');

const contrastFailures = [];
const consoleErrors = [];
const overflows = [];
const keyboardFailures = [];

/** 反复 Tab，断言没有不可见元素获得焦点，也没有折叠导航内的元素可聚焦。 */
async function keyboardWalkthrough(page, route) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const nav = el.closest('.nav');
      return {
        tag: el.tagName,
        label:
          el.getAttribute('aria-label') ||
          el.textContent?.trim().slice(0, 20) ||
          '',
        isFrame: el.tagName === 'IFRAME',
        visible:
          cs.visibility !== 'hidden' &&
          cs.display !== 'none' &&
          Number.parseFloat(cs.opacity) > 0 &&
          rect.height > 0,
        inCollapsedNav: Boolean(nav) && !nav.classList.contains('is-open'),
      };
    });
    if (!info) break;
    if (!info.visible && !info.isFrame) {
      keyboardFailures.push(
        `${route}  不可见元素获得焦点: <${info.tag}> "${info.label}"`,
      );
    }
    if (info.inCollapsedNav) {
      keyboardFailures.push(
        `${route}  已收起的导航内元素可聚焦: <${info.tag}> "${info.label}"`,
      );
    }
  }
}

async function main() {
  const server = await startStaticServer(DIST, PORT);
  const chrome = resolveChrome();
  const browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: chrome.kind === 'shell' ? 'shell' : true,
    args: ['--no-sandbox'],
    // /history/ 内嵌两个归档旧站的 iframe，渲染很重，会拖慢后续 CDP 调用
    // （表现为 Emulation.setTouchEmulationEnabled 超时级联）。
    // 默认 180s 不够，这里放宽。
    protocolTimeout: 300_000,
  });

  const page = await browser.newPage();
  page.on('pageerror', (e) =>
    consoleErrors.push(`pageerror: ${String(e.message).slice(0, 100)}`),
  );
  page.on('console', (m) => {
    // 归档 iframe 内的第三方噪声不算本站问题，但要能看到
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 100));
  });

  try {
    for (const route of routes) {
      try {
        for (const vp of VIEWPORTS) {
          await page.setViewport({ width: vp.width, height: vp.height });
          // 用 load 而非 networkidle0 —— /history/ 的 iframe 加载归档旧站，
          // 其外部资源可能长期挂起，networkidle0 永远等不到。
          await page.goto(`http://127.0.0.1:${PORT}${route}`, {
            waitUntil: 'domcontentloaded',
            timeout: 45_000,
          });
          await new Promise((r) => setTimeout(r, 250));

          // 横向溢出
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          if (overflow > 1)
            overflows.push(`${route} @${vp.name}  溢出 ${overflow}px`);

          // 对比度只在主视口跑一次，避免 ×3 的重复
          if (vp.name === '1440') {
            await page.addScriptTag({ content: axeSource });
            const nodes = await page.evaluate(async () => {
              const r = await window.axe.run(document, {
                runOnly: { type: 'rule', values: ['color-contrast'] },
              });
              return r.violations.flatMap((v) =>
                v.nodes.map((n) => n.target[0]),
              );
            });
            for (const t of nodes) contrastFailures.push(`${route}  ${t}`);
          }
        }

        // 键盘走查在移动视口做 —— 那时导航才是折叠的
        await page.setViewport({ width: 375, height: 812 });
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
        await keyboardWalkthrough(page, route);

        if (!QUIET) process.stdout.write('.');
      } catch (err) {
        // 单个路由失败不应中断整轮门禁
        consoleErrors.push(
          `${route}  导航失败: ${String(err.message).slice(0, 70)}`,
        );
        if (!QUIET) process.stdout.write('!');
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const sections = [
    ['对比度', contrastFailures],
    ['控制台错误', [...new Set(consoleErrors)]],
    ['横向溢出', overflows],
    ['键盘可达性', [...new Set(keyboardFailures)]],
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
  console.log('');

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(`\n门禁执行失败: ${err.message}`);
  process.exit(1);
});
