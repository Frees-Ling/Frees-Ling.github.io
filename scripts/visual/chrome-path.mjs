// 解析可用的 Chrome 可执行文件路径。
//
// 用 globSync 吃掉版本号目录，这样 Chrome 从 153 升到 154 之后脚本不会失效。
// 优先 chrome-headless-shell（专为无头截图构建、更轻），其次系统 Chrome。
//
// 注意：`~/.cache/puppeteer/chrome/<ver>/` 这个目录在本机是**空的**
// （puppeteer 的浏览器下载未完成），所以不能依赖 puppeteer.executablePath()。

import { existsSync, globSync } from 'node:fs';
import { homedir } from 'node:os';

const CANDIDATES = [
  process.env.CHROME_PATH,
  `${homedir()}/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell`,
  `${homedir()}/.cache/puppeteer/chrome/*/chrome-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

/**
 * @param {{ preferFullChrome?: boolean }} [opts]
 *   preferFullChrome: Lighthouse 需要完整 Chrome（`--headless=new`），
 *   它不接受 chrome-headless-shell。截图脚本用默认值即可。
 * @returns {{ path: string, kind: 'shell' | 'chrome' }}
 */
export function resolveChrome(opts = {}) {
  const found = [];
  for (const pattern of CANDIDATES) {
    for (const hit of globSync(pattern)) {
      if (existsSync(hit) && !found.includes(hit)) found.push(hit);
    }
  }

  if (found.length === 0) {
    throw new Error(
      '找不到可用的 Chrome。请安装 Google Chrome，或设置 CHROME_PATH 环境变量。',
    );
  }

  const isShell = (p) => p.includes('chrome-headless-shell');
  const pick = opts.preferFullChrome
    ? (found.find((p) => !isShell(p)) ?? found[0])
    : (found.find(isShell) ?? found[0]);

  return { path: pick, kind: isShell(pick) ? 'shell' : 'chrome' };
}
