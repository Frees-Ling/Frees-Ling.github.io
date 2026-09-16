// 本地服务的两道外围防线（SEC-002）。
//
// 这两条防线都**不依赖令牌**，所以它们在任何令牌实现下都成立 ——
// 这也是为什么值得单独测：令牌换实现时它们不该跟着变。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hostAllowed, createLoginThrottle } from './guard.mjs';
import { resolveStatic } from './web.mjs';
import { openDatabase } from '../db/schema.mjs';
import { createServer, loadOrCreateToken } from './index.mjs';

// ── Host 白名单 ──

test('Host 白名单只认回环地址的三种写法', () => {
  for (const ok of ['127.0.0.1:4319', 'localhost:4319', '[::1]:4319']) {
    assert.equal(hostAllowed(ok, 4319), true, `${ok} 应当放行`);
  }
});

test('Host 白名单拒绝外站域名，哪怕它当下解析到 127.0.0.1', () => {
  for (const bad of [
    'evil.com:4319',
    'evil.com',
    '127.0.0.1.nip.io:4319', // 通配 DNS，天然指向 127.0.0.1
    'localhost.evil.com:4319',
    '127.0.0.1:1', // 端口不符
    'localhost:8080',
    '',
    undefined,
  ]) {
    assert.equal(hostAllowed(bad, 4319), false, `${bad} 不该放行`);
  }
});

test('Host 判定不区分大小写，且容忍首尾空白', () => {
  assert.equal(hostAllowed('LocalHost:4319', 4319), true);
  assert.equal(hostAllowed('  127.0.0.1:4319  ', 4319), true);
});

// ── 登录限流 ──

test('限流只统计失败，成功不计入', () => {
  const t = createLoginThrottle({ max: 3, windowMs: 60_000 });
  const now = 1_000_000;

  for (let i = 0; i < 3; i++) {
    assert.equal(t.check('k', now), true, `第 ${i + 1} 次失败前应放行`);
    t.recordFailure('k', now);
  }
  assert.equal(t.check('k', now), false, '达到上限后应拒绝');
});

test('成功的登录把失败计数清零', () => {
  const t = createLoginThrottle({ max: 3, windowMs: 60_000 });
  const now = 1_000_000;
  t.recordFailure('k', now);
  t.recordFailure('k', now);
  assert.equal(t.check('k', now), true);

  t.recordSuccess('k');
  t.recordFailure('k', now);
  t.recordFailure('k', now);
  assert.equal(t.check('k', now), true, '清零后应重新获得完整额度');
});

test('窗口滑过之后自动恢复，不需要后台任务', () => {
  const t = createLoginThrottle({ max: 2, windowMs: 1_000 });
  const start = 1_000_000;
  t.recordFailure('k', start);
  t.recordFailure('k', start);
  assert.equal(t.check('k', start), false);

  // 窗口滑过
  assert.equal(t.check('k', start + 1_001), true, '窗口过后应恢复');
});

test('退避时间随最早一次失败滑出窗口而减少', () => {
  const t = createLoginThrottle({ max: 1, windowMs: 10_000 });
  const start = 1_000_000;
  t.recordFailure('k', start);
  assert.equal(t.check('k', start), false);
  assert.ok(t.retryAfter('k', start) > 0);
  assert.ok(t.retryAfter('k', start + 9_000) < t.retryAfter('k', start));
});

test('不同来源互不影响', () => {
  const t = createLoginThrottle({ max: 1, windowMs: 60_000 });
  const now = 1_000_000;
  t.recordFailure('a', now);
  assert.equal(t.check('a', now), false);
  assert.equal(t.check('b', now), true, '另一个来源不该被牵连');
});

// ── HTTP 层：真正的请求 ──

/** 起一个测试服务，并用裸 http.request 发请求（fetch 不允许改 Host）。 */
async function withServer(fn) {
  const home = mkdtempSync(join(tmpdir(), 'guard-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  const server = createServer({ db, token, home, provider: null });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const request = (path, { method = 'GET', host, body, contentType } = {}) =>
    new Promise((resolve, reject) => {
      const headers = {};
      if (host) headers.host = host;
      // 登录接口按 content-type 决定怎么解析 body：不带这个头会走 JSON 分支，
      // 于是表单文本解析失败、拿到 500 而不是 401/429
      if (contentType) headers['content-type'] = contentType;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            }),
          );
        },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });

  try {
    return await fn({ request, token, port, home });
  } finally {
    server.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
}

test('伪造 Host 的请求一律 403，且提示区分于「令牌不对」', async () => {
  await withServer(async ({ request }) => {
    const res = await request('/', { host: 'evil.com' });
    assert.equal(res.status, 403);
    assert.match(res.body, /本机/);
  });
});

test('伪造 Host 时连健康检查也不放行', async () => {
  await withServer(async ({ request }) => {
    // 健康检查是常见的疏漏点：它常常被排除在鉴权之外
    const res = await request('/api/health', { host: 'evil.com' });
    assert.notEqual(res.status, 200);
  });
});

test('正常 Host 仍可访问', async () => {
  await withServer(async ({ request, port }) => {
    const res = await request('/', { host: `127.0.0.1:${port}` });
    assert.equal(res.status, 200, '正常访问不该被这道防线挡住');
  });
});

test('反复登录失败会被限流，并给出 Retry-After', async () => {
  await withServer(async ({ request, port }) => {
    const host = `127.0.0.1:${port}`;
    const form = 'token=wrong-token';

    let last;
    for (let i = 0; i < 12; i++) {
      last = await request('/api/session', {
        method: 'POST',
        host,
        body: form,
        contentType: 'application/x-www-form-urlencoded',
      });
      if (last.status === 429) break;
    }

    assert.equal(last.status, 429, '持续猜令牌应当被限流');
    assert.ok(Number(last.headers['retry-after']) > 0, '要告诉调用方等多久');
    assert.match(last.body, /频繁/);
  });
});

test('登录成功仍然是成功的（限流不误伤）', async () => {
  await withServer(async ({ request, port, token }) => {
    const res = await request('/api/session', {
      method: 'POST',
      host: `127.0.0.1:${port}`,
      body: `token=${encodeURIComponent(token)}`,
      contentType: 'application/x-www-form-urlencoded',
    });
    assert.equal(res.status, 303, '正确的令牌必须能登录');
    assert.match(String(res.headers['set-cookie']), /HttpOnly/);
    assert.match(String(res.headers['set-cookie']), /SameSite=Strict/);
  });
});

test('会话 Cookie 不带 Domain，且不是持久 Cookie', async () => {
  await withServer(async ({ request, port, token }) => {
    const res = await request('/api/session', {
      method: 'POST',
      host: `127.0.0.1:${port}`,
      body: `token=${encodeURIComponent(token)}`,
      contentType: 'application/x-www-form-urlencoded',
    });
    const cookie = String(res.headers['set-cookie']);
    // 不带 Domain → 只对 127.0.0.1 这个 host 有效，不会漏给别的 host
    assert.doesNotMatch(cookie, /Domain=/i);
    // 没有 Max-Age / Expires → 会话 Cookie，关掉浏览器即失效
    assert.doesNotMatch(cookie, /Max-Age|Expires/i);
  });
});

test('未认证的 API 请求是 401，不是 403 —— 两者含义不同', async () => {
  await withServer(async ({ request, port }) => {
    const res = await request('/api/notes', { host: `127.0.0.1:${port}` });
    assert.equal(res.status, 401, '地址对但没凭据 → 401');
  });
});

// ── 静态文件的路径穿越 ──
//
// 这段防线原先就有，但**没有测试**。没测过的防线会随着重构悄悄失效，
// 而失效的表现是「本来读不到的文件突然能读了」—— 不会有人报 bug。
//
// 注意 resolveStatic 里有**两层**互相独立的防线：先对路径做归一化并剥掉
// 开头的 `../`，再用 startsWith 确认没出根目录。任何一层单独存在都足够，
// 因此**只删其中一层这个用例仍然会通过** —— 实测确认过。
// 这既是好事（纵深防御）也是陷阱：想验证这个用例有没有用，
// 必须把两层一起去掉，那时它才会报出「越出了根目录」。

test('路径穿越的各种写法都被挡住（含编码与分隔符变体）', () => {
  const root = mkdtempSync(join(tmpdir(), 'trav-'));
  writeFileSync(join(root, 'ok.txt'), 'x');
  mkdirSync(join(root, 'sub'));
  // 放在 root 之外的「机密」，任何一次越界都会读到它
  const outside = join(root, '..', 'trav-secret.txt');
  writeFileSync(outside, 'SECRET');

  try {
    const attempts = [
      '/ok.txt',
      '/../trav-secret.txt',
      '/../../etc/passwd',
      '/%2e%2e/trav-secret.txt',
      '/..%2ftrav-secret.txt',
      '/%2e%2e%2ftrav-secret.txt',
      '/....//trav-secret.txt',
      '/sub/../../trav-secret.txt',
      '//trav-secret.txt',
      '/.%2e/trav-secret.txt',
      '/%252e%252e/trav-secret.txt', // 二次编码
      '\\..\\trav-secret.txt',
    ];

    for (const attempt of attempts) {
      const out = resolveStatic(root, attempt);
      if (out === null) continue; // 挡住了
      assert.ok(out.startsWith(root), `${attempt} 越出了根目录：${out}`);
      assert.ok(
        !out.includes('trav-secret'),
        `${attempt} 读到了根目录之外的文件：${out}`,
      );
    }

    // 同时确认防线没有把正常路径也一起挡掉 —— 只测「挡得住」的话，
    // 一个永远返回 null 的实现也能通过
    assert.ok(resolveStatic(root, '/ok.txt'), '正常文件应当能读到');
    assert.ok(
      resolveStatic(root, '/sub/./../ok.txt'),
      '含 . 与 .. 的合法路径应能读到',
    );
  } finally {
    rmSync(outside, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
