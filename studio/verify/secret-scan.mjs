// 三面泄漏扫描（SEC-001）。
//
//   node studio/verify/secret-scan.mjs
//
// 往环境里放一个**随机哨兵**当作密钥，然后走一遍真实路径
// （真实服务 + 真实 Chrome + 真实 SQLite），最后扫描三个面：
//
//   ① 磁盘：库文件与整个数据目录的字节
//   ② 浏览器：localStorage / sessionStorage / cookie / 渲染后的 DOM
//   ③ 仓库：交给 scripts/check-secrets.mjs（它是独立的闸门，这里只调用）
//
// 为什么用随机串而不是固定的假密钥：固定串可能碰巧出现在别处，
// 于是断言「不含」会莫名失败；而更糟的是反过来 —— 断言「含」的时候
// 分不清是泄漏还是巧合。随机哨兵只有真的泄漏才会出现。
//
// 为什么三面都要扫：它们由**不同的机制**写入。磁盘是服务端写的，
// 浏览器是前端写的，仓库是人写的。只扫一面等于只堵一条路。

import puppeteer from 'puppeteer-core';
import { randomBytes } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { resolveChrome } from '../../scripts/visual/chrome-path.mjs';
import { start } from '../server/index.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SENTINEL = `SENTINEL${randomBytes(12).toString('hex')}`;

process.env.FREES_WEBDAV_PASSWORD = SENTINEL;
process.env.FREES_BACKUP_PASSPHRASE = SENTINEL;

const home = mkdtempSync(join(tmpdir(), 'secret-scan-'));
const findings = [];

function check(surface, what, leaked) {
  const ok = !leaked;
  console.log(`  ${ok ? '✅' : '❌'} ${surface} · ${what}`);
  if (!ok) findings.push(`${surface}/${what}`);
}

const { server, token, port, db } = await start({ home, port: 0 });
const base = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  executablePath: resolveChrome().path,
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

try {
  await page.goto(base, { waitUntil: 'load' });
  await page.type('input[name="token"]', token);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.click('button[type="submit"]'),
  ]);

  // 走一遍配置页：存引用、列配置、看状态
  await page.click('#tab-settings');
  await page.waitForFunction(
    () => document.querySelectorAll('#settings .setting').length > 0,
    { timeout: 8000 },
  );
  await page.evaluate(async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'webdav.password',
        value: { kind: 'env', name: 'FREES_WEBDAV_PASSWORD' },
      }),
    });
    await fetch('/api/settings');
  });

  console.log(
    `哨兵：${SENTINEL.slice(0, 12)}…（共 ${SENTINEL.length} 字符）\n`,
  );

  // ① 浏览器 —— **必须在服务还活着的时候做**，其中包含一次真实请求。
  //    顺序写错过一次：先关了服务再 fetch，拿到的是 Failed to fetch，
  //    而那不是泄漏，是测试自己排错了步骤。
  const browserBlob = await page.evaluate(
    () =>
      `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}${document.cookie}`,
  );
  check(
    '浏览器',
    'localStorage / sessionStorage / cookie',
    browserBlob.includes(SENTINEL),
  );

  const dom = await page.content();
  check('浏览器', '渲染后的 DOM', dom.includes(SENTINEL));

  const apiBody = await page.evaluate(async () => {
    const r = await fetch('/api/settings');
    return await r.text();
  });
  check('浏览器', '配置接口响应体', apiBody.includes(SENTINEL));

  // ② 磁盘 —— 关掉服务再读，避免读到写了一半的文件
  db.close();
  server.close();

  const dbBytes = readFileSync(join(home, 'studio.db'), 'latin1');
  check('磁盘', '库文件字节', dbBytes.includes(SENTINEL));

  let homeBlob = '';
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (statSync(full).isFile())
        homeBlob += readFileSync(full, 'latin1');
    }
  };
  walk(home);
  check('磁盘', '整个数据目录', homeBlob.includes(SENTINEL));

  // ③ 仓库 —— 复用既有闸门，不另写一套规则
  let repoClean = true;
  let repoNote = 'check-secrets 未报告问题';
  try {
    execFileSync('node', [join(ROOT, 'scripts/check-secrets.mjs'), '--all'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  } catch (error) {
    repoClean = false;
    // 只取首行：闸门输出刻意不回显匹配内容，这里也不该扩大它
    repoNote = String(error.stderr ?? '')
      .split('\n')
      .find((line) => line.trim())
      ?.slice(0, 80);
  }
  check('仓库', `已跟踪文件（${repoNote}）`, !repoClean);
} finally {
  await browser.close().catch(() => {});
  try {
    server.close();
  } catch {
    /* 上面可能已经关过 */
  }
  rmSync(home, { recursive: true, force: true });
}

console.log();
if (findings.length === 0) {
  console.log('✓ 三个面均未发现明文密钥');
  process.exit(0);
}
console.error(`✗ ${findings.length} 处可能泄漏：${findings.join('、')}`);
process.exit(1);
