// 无障碍审计：axe-core 扫描 + 键盘可达性走查。
//
// 用法：
//   node scripts/visual/a11y.mjs                    # 默认路由集
//   node scripts/visual/a11y.mjs --routes /,/blog/
//   node scripts/visual/a11y.mjs --port 4399
//
// 键盘走查专门验证一个曾经存在的缺陷：移动端导航收起时
// （max-height:0 + opacity:0）7 个不可见链接仍可获得焦点。
// 仅靠 CSS 隐藏而不加 visibility/inert 时，Tab 会聚焦到看不见的元素上。

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './chrome-path.mjs';
import { startStaticServer } from './serve.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(ROOT, 'dist');
const AXE_PATH = join(ROOT, 'node_modules/axe-core/axe.min.js');

const DEFAULT_ROUTES = [
  '/',
  '/blog/',
  '/blog/thinking/',
  // transformer 是渲染器的边界样本：651 个标题、496 个公式、538 个 hr。
  // 它曾经带着一个 KaTeX 解析错误和 5 个不可键盘滚动的公式块上线，
  // 而默认路由集里没有它，所以那些缺陷一直没被这道闸门看到。
  '/blog/transformer/',
  '/about/',
  '/projects/',
  '/archive/',
  '/gallery/',
  '/music/',
  '/friends/',
  '/search/',
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const port = Number(arg('port', '4399'));
const routes = arg('routes', '') ? arg('routes').split(',') : DEFAULT_ROUTES;

// 移动端视口：导航此时是折叠的，是键盘走查的关键场景
const MOBILE = { width: 375, height: 812 };

/**
 * 反复按 Tab，断言没有任何不可见元素获得焦点。
 * 特别关注仍在折叠的 .site-nav 内部的链接。
 */
async function keyboardWalkthrough(page) {
  const problems = [];
  const focusable = [];

  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const nav = el.closest('.site-nav');
      return {
        tag: el.tagName,
        label:
          el.getAttribute('aria-label') ||
          el.textContent?.trim().slice(0, 24) ||
          '',
        // iframe 天然可聚焦（如 giscus 评论框），且懒加载期间高度为 0，
        // 把它算作「不可见却可聚焦」是误报。
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
    focusable.push(info);
    if (!info.visible && !info.isFrame) {
      problems.push(`不可见元素获得焦点: <${info.tag}> "${info.label}"`);
    }
    if (info.inCollapsedNav) {
      problems.push(
        `已收起的导航内元素仍可获得焦点: <${info.tag}> "${info.label}"`,
      );
    }
  }

  return { problems, focusableCount: focusable.length };
}

async function main() {
  const server = await startStaticServer(DIST, port);
  const chrome = resolveChrome();
  const browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: chrome.kind === 'shell' ? 'shell' : true,
    args: ['--no-sandbox'],
  });

  const axeSource = readFileSync(AXE_PATH, 'utf8');
  let totalViolations = 0;
  const keyboardProblems = [];

  try {
    for (const route of routes) {
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
        });
        await page.goto(`http://127.0.0.1:${port}${route}`, {
          waitUntil: 'networkidle0',
          timeout: 60_000,
        });

        await page.addScriptTag({ content: axeSource });
        const result = await page.evaluate(async () => {
          const r = await window.axe.run(document, {
            runOnly: {
              type: 'tag',
              values: [
                'wcag2a',
                'wcag2aa',
                'wcag21a',
                'wcag21aa',
                'best-practice',
              ],
            },
          });
          return r.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
            target: v.nodes[0]?.target?.join(' ') ?? '',
          }));
        });

        if (result.length) {
          totalViolations += result.length;
          console.log(`\n  ${route}`);
          for (const v of result) {
            console.log(
              `    [${v.impact}] ${v.id} ×${v.nodes}  ${v.help}\n        ${v.target}`,
            );
          }
        }

        // 键盘走查只在移动视口做 —— 那时导航才处于折叠状态
        await page.setViewport(MOBILE);
        await page.reload({ waitUntil: 'networkidle0' });
        const kb = await keyboardWalkthrough(page);
        for (const p of kb.problems) keyboardProblems.push(`${route}  ${p}`);
      } catch (err) {
        console.error(`  ✗ ${route}: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n─────────────────────────────');
  if (totalViolations === 0) {
    console.log('✓ axe-core：未发现违规');
  } else {
    console.log(`✗ axe-core：${totalViolations} 类违规`);
  }

  if (keyboardProblems.length === 0) {
    console.log('✓ 键盘走查：无不可见元素获得焦点');
  } else {
    console.log(`✗ 键盘走查：${keyboardProblems.length} 项问题`);
    for (const p of [...new Set(keyboardProblems)].slice(0, 12)) {
      console.log(`    ${p}`);
    }
  }
  console.log('');

  if (totalViolations || keyboardProblems.length) process.exit(1);
}

main().catch((err) => {
  console.error(`\n失败: ${err.message}`);
  process.exit(1);
});
