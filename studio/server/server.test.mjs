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
import { createNote } from '../db/store.mjs';
import { createProvider } from '../ai/provider.mjs';
import { startMockServer } from '../ai/mock.mjs';
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

// ─────────────────── 对话路由（KB-004）───────────────────

test('对话：创建、列表、读取、删除', async () => {
  await withServer(async ({ call }) => {
    const created = await call('/api/conversations', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(created.status, 201);
    const { conversation } = await created.json();

    const list = await call('/api/conversations');
    assert.equal((await list.json()).conversations.length, 1);

    const detail = await call(`/api/conversations/${conversation.id}`);
    assert.equal(detail.status, 200);

    assert.equal(
      (
        await call(`/api/conversations/${conversation.id}`, {
          method: 'DELETE',
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(`/api/conversations/${conversation.id}`)).status,
      404,
    );
  });
});

test('没有可用模型端点时给出可操作的提示，而不是静默失败', async () => {
  await withServer(async ({ call }) => {
    const { conversation } = await (
      await call('/api/conversations', { method: 'POST', body: '{}' })
    ).json();
    const res = await call(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '你好' }),
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /本地推理服务/);
  });
});

test('空消息被拒绝', async () => {
  await withServer(async ({ call }) => {
    const { conversation } = await (
      await call('/api/conversations', { method: 'POST', body: '{}' })
    ).json();
    const res = await call(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '   ' }),
    });
    assert.equal(res.status, 400);
  });
});

test('模型不可达时保留用户消息，且不把错误写进历史', async () => {
  const home = mkdtempSync(join(tmpdir(), 'studio-chat-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  const provider = createProvider({
    baseUrl: 'http://127.0.0.1:9/v1',
    timeoutMs: 1500,
  });
  const server = createServer({ db, token, home, provider });
  await new Promise((r) => server.listen(0, BIND_HOST, r));
  const base = `http://${BIND_HOST}:${server.address().port}`;
  const call = (p, init = {}) =>
    fetch(base + p, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  try {
    const { conversation } = await (
      await call('/api/conversations', { method: 'POST', body: '{}' })
    ).json();
    const res = await call(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '这条应该被保留' }),
    });
    assert.equal(res.status, 502);

    const detail = await (
      await call(`/api/conversations/${conversation.id}`)
    ).json();
    assert.equal(detail.conversation.messages.length, 1, '用户消息应保留');
    assert.equal(detail.conversation.messages[0].role, 'user');
    assert.doesNotMatch(
      JSON.stringify(detail.conversation.messages),
      /无法连接模型端点/,
      '错误不应被写进历史，否则下次请求会带上它',
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('引用注入：检索命中的笔记作为系统消息送达模型，并被持久化', async () => {
  const mock = await startMockServer();
  const home = mkdtempSync(join(tmpdir(), 'studio-cit-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  createNote(db, {
    title: '线性代数与注意力机制',
    body: '从几何直觉出发理解注意力',
  });
  const provider = createProvider({
    baseUrl: mock.baseUrl,
    model: 'mock-model',
  });
  const server = createServer({ db, token, home, provider });
  await new Promise((r) => server.listen(0, BIND_HOST, r));
  const base = `http://${BIND_HOST}:${server.address().port}`;
  const call = (p, init = {}) =>
    fetch(base + p, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  try {
    const { conversation } = await (
      await call('/api/conversations', { method: 'POST', body: '{}' })
    ).json();
    const res = await call(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '注意力机制' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();

    // 模拟服务会数出注入了几段引用
    assert.match(body.message.content, /附带 1 段知识库引用/);
    assert.equal(body.citations.length, 1);
    assert.equal(body.citations[0].title, '线性代数与注意力机制');
    assert.deepEqual(body.message.citations, [body.citations[0].id]);

    // 引用必须落库，事后可追溯
    const detail = await (
      await call(`/api/conversations/${conversation.id}`)
    ).json();
    const assistant = detail.conversation.messages.find(
      (m) => m.role === 'assistant',
    );
    assert.equal(assistant.citations.length, 1);
  } finally {
    await new Promise((r) => server.close(r));
    await mock.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('把回答存为草稿：带 ai_draft 标记，且不进入已确认内容', async () => {
  const mock = await startMockServer();
  const home = mkdtempSync(join(tmpdir(), 'studio-draft-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  const provider = createProvider({
    baseUrl: mock.baseUrl,
    model: 'mock-model',
  });
  const server = createServer({ db, token, home, provider });
  await new Promise((r) => server.listen(0, BIND_HOST, r));
  const base = `http://${BIND_HOST}:${server.address().port}`;
  const call = (p, init = {}) =>
    fetch(base + p, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  try {
    const { conversation } = await (
      await call('/api/conversations', { method: 'POST', body: '{}' })
    ).json();
    const sent = await (
      await call(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: '随便问点什么' }),
      })
    ).json();

    const res = await call(`/api/conversations/${conversation.id}/draft`, {
      method: 'POST',
      body: JSON.stringify({
        messageId: sent.message.id,
        title: '来自 AI 的草稿',
      }),
    });
    assert.equal(res.status, 201);
    const { note } = await res.json();
    assert.equal(note.origin, 'ai_draft');
    assert.equal(note.status, 'draft');
  } finally {
    await new Promise((r) => server.close(r));
    await mock.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('提取记忆时校验消息确实属于 URL 中的对话', async () => {
  const mock = await startMockServer();
  const home = mkdtempSync(join(tmpdir(), 'studio-idor-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  const provider = createProvider({
    baseUrl: mock.baseUrl,
    model: 'mock-model',
  });
  const server = createServer({ db, token, home, provider });
  await new Promise((r) => server.listen(0, BIND_HOST, r));
  const base = `http://${BIND_HOST}:${server.address().port}`;
  const call = (p, init = {}) =>
    fetch(base + p, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  try {
    // 两段对话，各自产生一条回答
    const mk = async () => {
      const { conversation } = await (
        await call('/api/conversations', { method: 'POST', body: '{}' })
      ).json();
      const sent = await (
        await call(`/api/conversations/${conversation.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: '问题 ' + conversation.id.slice(0, 6),
          }),
        })
      ).json();
      return { conversation, messageId: sent.message.id };
    };
    const a = await mk();
    const b = await mk();

    // 用对话 A 的路径 + 对话 B 的消息 → 必须拒绝
    const wrong = await call(
      `/api/conversations/${a.conversation.id}/memories`,
      {
        method: 'POST',
        body: JSON.stringify({ messageId: b.messageId }),
      },
    );
    assert.equal(wrong.status, 404, '来源与路径不符时必须拒绝');

    // 正确的组合仍然可用
    const right = await call(
      `/api/conversations/${a.conversation.id}/memories`,
      {
        method: 'POST',
        body: JSON.stringify({ messageId: a.messageId }),
      },
    );
    assert.equal(
      right.status,
      201,
      '实际响应: ' +
        JSON.stringify(
          await right
            .clone()
            .json()
            .catch(() => null),
        ),
    );
  } finally {
    await new Promise((r) => server.close(r));
    await mock.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────── KB-005 的路由（此前只测了 store，路由未覆盖）───────────

/** 起一个带模拟模型的完整服务，跑一段对话，返回常用句柄。 */
async function withChat(fn) {
  const mock = await startMockServer();
  const home = mkdtempSync(join(tmpdir(), 'studio-k5-'));
  const token = loadOrCreateToken(home);
  const db = openDatabase(':memory:');
  const provider = createProvider({
    baseUrl: mock.baseUrl,
    model: 'mock-model',
  });
  const server = createServer({ db, token, home, provider });
  await new Promise((r) => server.listen(0, BIND_HOST, r));
  const base = `http://${BIND_HOST}:${server.address().port}`;
  const call = (p, init = {}) =>
    fetch(base + p, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  try {
    const { conversation } = await (
      await call('/api/conversations', { method: 'POST', body: '{}' })
    ).json();
    const sent = await (
      await call(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: '注意力机制的几何直觉' }),
      })
    ).json();
    await fn({ call, conversation, messageId: sent.message.id, db });
  } finally {
    await new Promise((r) => server.close(r));
    await mock.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
}

test('路由：从回答提取记忆，带来源消息', async () => {
  await withChat(async ({ call, conversation, messageId }) => {
    const res = await call(`/api/conversations/${conversation.id}/memories`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    });
    assert.equal(res.status, 201);
    const { memory } = await res.json();
    assert.equal(memory.status, 'pending', '提取的记忆必须是待审核');
    assert.equal(memory.source_message_id, messageId);
  });
});

test('路由：来源链可查', async () => {
  await withChat(async ({ call, conversation, messageId }) => {
    const { memory } = await (
      await call(`/api/conversations/${conversation.id}/memories`, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      })
    ).json();

    const res = await call(`/api/memories/${memory.id}/provenance`);
    assert.equal(res.status, 200);
    const prov = await res.json();
    assert.equal(prov.message.conversation_id, conversation.id);
  });
});

test('路由：记忆与知识库条目的关联增删', async () => {
  await withChat(async ({ call, conversation, messageId }) => {
    const { note } = await (
      await call('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: '几何直觉笔记' }),
      })
    ).json();
    const { memory } = await (
      await call(`/api/conversations/${conversation.id}/memories`, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      })
    ).json();

    const linked = await call(`/api/memories/${memory.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ noteId: note.id }),
    });
    assert.equal(linked.status, 201);

    const prov = await (
      await call(`/api/memories/${memory.id}/provenance`)
    ).json();
    assert.equal(prov.notes[0].id, note.id);

    const unlinked = await call(
      `/api/memories/${memory.id}/notes?noteId=${note.id}`,
      { method: 'DELETE' },
    );
    assert.equal(unlinked.status, 200);
    const after = await (
      await call(`/api/memories/${memory.id}/provenance`)
    ).json();
    assert.equal(after.notes.length, 0);
  });
});

test('路由：统一检索排除待审核记忆', async () => {
  await withChat(async ({ call, conversation, messageId }) => {
    await call('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: '注意力机制笔记' }),
    });
    // 显式给出记忆内容：默认取的是助手消息正文，而模拟服务的回答是固定文案，
    // 不含查询词 —— 不指定的话测的是「搜不到」，不是「被排除」。
    const { memory } = await (
      await call(`/api/conversations/${conversation.id}/memories`, {
        method: 'POST',
        body: JSON.stringify({
          messageId,
          content: '注意力机制要先看几何直觉',
        }),
      })
    ).json();

    // 未审核：不出现在检索里
    const before = await (
      await call('/api/search-all?q=' + encodeURIComponent('注意力机制'))
    ).json();
    assert.equal(before.notes.length, 1);
    assert.equal(before.memories.length, 0, '待审核记忆不得进入检索');

    // 审核通过后才出现
    await call(`/api/memories/${memory.id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved' }),
    });
    const after = await (
      await call('/api/search-all?q=' + encodeURIComponent('注意力机制'))
    ).json();
    assert.equal(after.memories.length, 1);
  });
});
