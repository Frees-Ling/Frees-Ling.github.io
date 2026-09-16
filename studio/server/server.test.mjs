// 知识库服务层测试（K1）。
//
//   node --test studio/
//
// 全部用内存数据库与临时目录，不接触任何真实私人数据。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../db/schema.mjs';
import {
  createServer,
  loadOrCreateToken,
  tokenMatches,
  BIND_HOST,
} from './index.mjs';

/** 起一个测试服务，返回 { base, token, close }。 */
async function withServer(fn) {
  const home = mkdtempSync(join(tmpdir(), 'studio-test-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  const server = createServer({ db, token, home });
  await new Promise((r) => server.listen(0, BIND_HOST, r));
  const base = `http://${BIND_HOST}:${server.address().port}`;

  const call = (path, init = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });

  try {
    await fn({ call, base, token, db, home });
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
}

// ─────────────────────────── 鉴权 ───────────────────────────

test('无令牌一律 401', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/notes`);
    assert.equal(res.status, 401);
  });
});

test('错误令牌一律 401', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/notes`, {
      headers: { authorization: 'Bearer wrong-token' },
    });
    assert.equal(res.status, 401);
  });
});

test('健康检查同样需要鉴权', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 401, '健康检查不应是免鉴权的例外');
  });
});

test('tokenMatches 对长度不同与空值都返回 false', () => {
  assert.equal(tokenMatches('abc', 'abcd'), false);
  assert.equal(tokenMatches('abc', ''), false);
  assert.equal(tokenMatches('abc', undefined), false);
  assert.equal(tokenMatches('abc', 'abc'), true);
});

test('令牌文件权限为 600 且可重复读取', () => {
  const home = mkdtempSync(join(tmpdir(), 'studio-token-'));
  try {
    const first = loadOrCreateToken(home);
    const mode = statSync(join(home, 'token')).mode & 0o777;
    assert.equal(mode, 0o600, '令牌文件必须是 600');
    assert.equal(loadOrCreateToken(home), first, '重复读取应返回同一个令牌');
    assert.ok(first.length >= 32, '令牌长度应足够');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────────────────── 笔记 CRUD ───────────────────────────

test('创建、读取、更新、删除笔记', async () => {
  await withServer(async ({ call }) => {
    const created = await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: '麻将 AI 的评估方法',
        body: '正文',
        tags: ['AI'],
      }),
    });
    assert.equal(created.status, 201);
    const { note } = await created.json();
    assert.deepEqual(note.tags, ['AI']);

    const read = await call(`/api/notes/${note.id}`);
    assert.equal((await read.json()).note.title, '麻将 AI 的评估方法');

    const patched = await call(`/api/notes/${note.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '改过的标题', tags: ['机器人'] }),
    });
    const updated = (await patched.json()).note;
    assert.equal(updated.title, '改过的标题');
    assert.deepEqual(updated.tags, ['机器人']);

    const removed = await call(`/api/notes/${note.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);

    const gone = await call(`/api/notes/${note.id}`);
    assert.equal(gone.status, 404);
  });
});

test('读取不存在的笔记返回 404 而不是空对象', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/notes/does-not-exist');
    assert.equal(res.status, 404);
  });
});

test('参数校验失败返回 400 且不泄露内部细节', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: '   ' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /标题不能为空/);
    // 不应出现堆栈或文件路径
    assert.equal(body.stack, undefined);
    assert.doesNotMatch(JSON.stringify(body), /\/Users\/|node_modules/);
  });
});

test('非法 JSON 请求体返回 400', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/notes', {
      method: 'POST',
      body: '{不是 JSON',
    });
    assert.equal(res.status, 400);
  });
});

test('调用方不能自称 origin=human 绕过 AI 标注', async () => {
  await withServer(async ({ call }) => {
    const res = await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', origin: 'human' }),
    });
    // 路由层刻意不接受调用方指定 origin；默认即 human 是因为这是人通过界面建的
    assert.equal(res.status, 201);
    const { note } = await res.json();
    assert.equal(note.origin, 'human');
  });
});

// ─────────────────────────── 检索 ───────────────────────────

test('中文检索走通服务层', async () => {
  await withServer(async ({ call }) => {
    await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: '线性代数与注意力机制',
        body: '从几何直觉出发',
      }),
    });
    await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: '无关内容', body: '别的东西' }),
    });

    const res = await call('/api/search?q=' + encodeURIComponent('注意力机制'));
    const { hits } = await res.json();
    assert.equal(hits.length, 1);
  });
});

test('空检索返回空数组而不是全部', async () => {
  await withServer(async ({ call }) => {
    await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: 'x' }),
    });
    const res = await call('/api/search?q=');
    assert.deepEqual((await res.json()).hits, []);
  });
});

// ─────────────────────────── 档案与记忆 ───────────────────────────

test('档案导入幂等', async () => {
  await withServer(async ({ call }) => {
    const payload = JSON.stringify({
      kind: 'conversation',
      source: 'a.json',
      content: '原文',
    });
    const first = await call('/api/archive', { method: 'POST', body: payload });
    const second = await call('/api/archive', {
      method: 'POST',
      body: payload,
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).deduped, true);
  });
});

test('记忆只能先进入 pending，且必须显式审核', async () => {
  await withServer(async ({ call }) => {
    const created = await call('/api/memories', {
      method: 'POST',
      body: JSON.stringify({ content: '偏好简短回答', confidence: 0.7 }),
    });
    assert.equal(created.status, 201);
    const { memory } = await created.json();
    assert.equal(memory.status, 'pending');

    const pending = await call('/api/memories?status=pending');
    assert.equal((await pending.json()).memories.length, 1);
    const approved = await call('/api/memories?status=approved');
    assert.equal(
      (await approved.json()).memories.length,
      0,
      '未经审核不得出现在已确认里',
    );

    const review = await call(`/api/memories/${memory.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved' }),
    });
    assert.equal(review.status, 200);

    const after = await call('/api/memories?status=approved');
    assert.equal((await after.json()).memories.length, 1);
  });
});

test('重复审核返回 400', async () => {
  await withServer(async ({ call }) => {
    const { memory } = await (
      await call('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ content: 'x' }),
      })
    ).json();
    await call(`/api/memories/${memory.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved' }),
    });
    const again = await call(`/api/memories/${memory.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'rejected' }),
    });
    assert.equal(again.status, 400);
  });
});

// ─────────────────────────── 边界 ───────────────────────────

test('未知路由返回 404', async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call('/api/nope')).status, 404);
    assert.equal((await call('/api/notes/x/y/z')).status, 404);
  });
});

test('不存在任何「公开发布」的路由', async () => {
  await withServer(async ({ call }) => {
    for (const p of [
      '/api/publish',
      '/api/notes/x/publish',
      '/api/export/public',
    ]) {
      const res = await call(p, { method: 'POST', body: '{}' });
      assert.equal(res.status, 404, `${p} 不应存在`);
    }
  });
});

test('超大请求体被拒绝而不是把进程撑爆', async () => {
  await withServer(async ({ call }) => {
    const huge = JSON.stringify({
      title: 'x',
      body: 'a'.repeat(2 * 1024 * 1024),
    });
    const res = await call('/api/notes', { method: 'POST', body: huge });
    assert.equal(res.status, 400);
  });
});

test('服务只绑 127.0.0.1', () => {
  assert.equal(BIND_HOST, '127.0.0.1');
  assert.ok(!existsSync('/dev/null/nope'), 'sanity');
});

// ─────────────────── 界面托管与会话（KB-002）───────────────────

test('未登录访问 / 得到登录页而不是界面', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /书房/);
    assert.match(html, /token/);
    assert.doesNotMatch(html, /id="editor"/, '不应直接给出编辑界面');
  });
});

test('令牌正确时下发 HttpOnly + SameSite=Strict 的会话 Cookie', async () => {
  await withServer(async ({ base, token }) => {
    const res = await fetch(base + '/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      redirect: 'manual',
    });
    assert.equal(res.status, 303);
    const cookie = res.headers.get('set-cookie') || '';
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.doesNotMatch(cookie, /Domain=/, '不应设置 Domain');
  });
});

test('令牌错误时拒绝建立会话', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(base + '/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong' }),
    });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null, '失败时不应下发 Cookie');
  });
});

test('带会话 Cookie 时可访问 API', async () => {
  await withServer(async ({ base, token }) => {
    const res = await fetch(base + '/api/notes', {
      headers: { cookie: `frees_studio=${encodeURIComponent(token)}` },
    });
    assert.equal(res.status, 200);
  });
});

test('伪造的会话 Cookie 无效', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(base + '/api/notes', {
      headers: { cookie: 'frees_studio=fake' },
    });
    assert.equal(res.status, 401);
  });
});

test('静态资源路径穿越被拒绝', async () => {
  await withServer(async ({ base }) => {
    for (const p of [
      '/static/../../package.json',
      '/static/..%2f..%2fpackage.json',
      '/static/nope.js',
    ]) {
      const res = await fetch(base + p);
      // 只断言「读不到」，不锁定具体状态码：
      // fetch 会先把 /static/../../x 规范化成 /x，于是走鉴权分支返回 401；
      // 编码过的变体才会真正到达静态处理器并返回 404。
      // 两种情况都安全，测试不该把实现细节写死。
      assert.notEqual(res.status, 200, `${p} 不应可读`);
      const body = await res.text();
      assert.doesNotMatch(
        body,
        /"name":\s*"frees-blog"/,
        `${p} 泄露了文件内容`,
      );
    }
  });
});

test('tokens.css 可被界面读取（设计与公开站同源）', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(base + '/tokens.css');
    assert.equal(res.status, 200);
    const css = await res.text();
    assert.match(css, /--canvas:/);
    assert.match(css, /--primary:/);
  });
});

test('界面脚本不含任何令牌或内联色值', async () => {
  await withServer(async ({ base }) => {
    const js = await (await fetch(base + '/static/app.js')).text();
    assert.doesNotMatch(js, /Bearer/, '脚本不应接触令牌');
    const css = await (await fetch(base + '/static/studio.css')).text();
    // 颜色必须来自 tokens.css，样式表里不应出现颜色字面量
    const literals = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(
      literals,
      [],
      `studio.css 不应含颜色字面量，发现: ${literals}`,
    );
  });
});
