// 多视口 + 双主题 + 整页截图，并采集 Core Web Vitals。
//
// 用法：
//   node scripts/visual/screenshot.mjs --label baseline
//   node scripts/visual/screenshot.mjs --label P3 --filter blog
//   node scripts/visual/screenshot.mjs --label P0 --routes /,/about/
//
// 输出：_backups/shots/<label>/  （该目录已在 .gitignore 里）
//   <route>__<viewport>__<theme>.png
//   metrics.json
//
// 为什么不用 chrome-headless-shell 的 --screenshot CLI：
//   --window-size=1440,20000 这类「超高视口」会把 100svh 变成 20000px，
//   而首页有 .hero{min-height:calc(100svh - 79px)}，hero 会被撑成 20000px 高，
//   截图完全不可用。而且纯 CLI 无法切换主题（主题靠 <html data-theme> 属性）。

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(ROOT, 'dist');
const OUT_ROOT = join(ROOT, '_backups/shots');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// 简报指定的目标视口
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900, dsf: 1 },
  { name: '1280x800', width: 1280, height: 800, dsf: 1 },
  { name: '1024x768', width: 1024, height: 768, dsf: 1 },
  { name: '768x1024', width: 768, height: 1024, dsf: 2 },
  { name: '430x932', width: 430, height: 932, dsf: 3 },
  { name: '390x844', width: 390, height: 844, dsf: 3 },
  { name: '360x800', width: 360, height: 800, dsf: 3 },
];

const THEMES = ['dark', 'light'];

// 截图专用稳定化 —— 只影响截图，不影响真实页面。
// 隐藏阅读进度条：(a) 它随滚动位置变化，永远不稳定；(b) 它在整页截图里会拉出长条。
const STABILIZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
  .reading-progress { display: none !important; }
`;

// 采集 LCP / CLS / TBT。约 30 行，零依赖。
// INP 在无真实交互的 lab 环境里测不到，用 TBT 近似。
const CWV_PROBE = `
  window.__cwv = { lcp: 0, cls: 0, tbt: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__cwv.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__cwv.tbt += Math.max(0, e.duration - 50);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
`;

// ---------- 参数 ----------
function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const label = arg('label', 'current');
const filter = arg('filter', '');
const port = Number(arg('port', '4399'));
const onlyRoutes = arg('routes', '')
  ? arg('routes')
      .split(',')
      .map((s) => s.trim())
  : null;

// ---------- 路由发现：扫描 dist，不硬编码 ----------
function discoverRoutes() {
  if (onlyRoutes) return onlyRoutes;
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // 历史归档是 224 个文件、15MB，与当前设计无关，跳过
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

const slug = (route) =>
  route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '_');

// ---------- 内建静态服务器 ----------
// 不用 `astro preview`：它在本机是守护进程化的，spawn 之后 kill 父进程杀不掉它，
// 会留下残留服务占用端口。自己起一个静态服务器更可控，也更快。
function startServer() {
  const server = createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    let filePath = resolve(DIST, `.${normalize(urlPath)}`);

    // 防目录穿越：解析结果必须仍在 dist/ 内
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403);
      res.end();
      return;
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

// ---------- 主流程 ----------
async function main() {
  if (!existsSync(DIST)) {
    throw new Error('dist/ 不存在，先跑 npm run build');
  }

  let routes = discoverRoutes();
  if (filter) routes = routes.filter((r) => r.includes(filter));

  const outDir = join(OUT_ROOT, label);
  mkdirSync(outDir, { recursive: true });

  const chrome = resolveChrome();
  console.log(`浏览器: ${chrome.path}`);
  console.log(`输出:   _backups/shots/${label}/`);
  console.log(
    `路由:   ${routes.length} 个 × ${VIEWPORTS.length} 视口 × ${THEMES.length} 主题`,
  );
  console.log('');

  const server = await startServer();
  console.log(`服务:   http://127.0.0.1:${port}/`);
  const browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: chrome.kind === 'shell' ? 'shell' : true,
    args: ['--no-sandbox', '--hide-scrollbars', '--font-render-hinting=none'],
  });

  const metrics = [];
  let done = 0;
  const total = routes.length * VIEWPORTS.length * THEMES.length;

  try {
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
          const page = await browser.newPage();
          try {
            await page.setViewport({
              width: vp.width,
              height: vp.height,
              deviceScaleFactor: vp.dsf,
            });
            await page.evaluateOnNewDocument(CWV_PROBE);
            await page.evaluateOnNewDocument((t) => {
              try {
                localStorage.setItem('frees-theme', t);
              } catch {}
              document.documentElement.dataset.theme = t;
            }, theme);

            await page.goto(`http://localhost:${port}${route}`, {
              waitUntil: 'networkidle0',
              timeout: 60_000,
            });

            // 等字体真正就绪，否则会截到 font-display: swap 的中间态，
            // 阶段之间的 diff 会全是噪声
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(
              () =>
                new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                ),
            );

            await page.addStyleTag({ content: STABILIZE_CSS });

            const file = join(
              outDir,
              `${slug(route)}__${vp.name}__${theme}.png`,
            );
            await page.screenshot({ path: file, fullPage: true });

            const cwv = await page.evaluate(() => window.__cwv ?? null);
            metrics.push({ route, viewport: vp.name, theme, ...cwv });

            done++;
            process.stdout.write(
              `\r  ${done}/${total}  ${route} ${vp.name} ${theme}   `,
            );
          } catch (err) {
            console.error(`\n  ✗ ${route} ${vp.name} ${theme}: ${err.message}`);
          } finally {
            await page.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  writeFileSync(
    join(outDir, 'metrics.json'),
    `${JSON.stringify({ label, generatedAt: new Date().toISOString(), metrics }, null, 2)}\n`,
  );

  console.log(`\n\n完成。${done}/${total} 张截图写入 _backups/shots/${label}/`);

  // 打印各视口首页的 CWV 摘要
  const home = metrics.filter((m) => m.route === '/' && m.theme === 'dark');
  if (home.length) {
    console.log('\n首页 CWV（dark）:');
    for (const m of home) {
      console.log(
        `  ${m.viewport.padEnd(9)} LCP ${Math.round(m.lcp)}ms  CLS ${m.cls.toFixed(4)}  TBT ${Math.round(m.tbt)}ms`,
      );
    }
  }
}

main().catch((err) => {
  console.error(`\n失败: ${err.message}`);
  process.exit(1);
});
