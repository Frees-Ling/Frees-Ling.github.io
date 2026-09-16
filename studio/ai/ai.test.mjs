// 模型适配层、模拟推理服务与对话存储的测试。
//
// 全部用本地模拟服务与内存数据库 —— 不联系任何真实模型，
// 也不向任何外部地址发送内容。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../db/schema.mjs';
import {
  createConversation,
  listConversations,
  getConversation,
  addMessage,
  deleteConversation,
  saveAnswerAsDraft,
  getNote,
} from '../db/store.mjs';
import {
  createProvider,
  assertEndpointAllowed,
  isLocalEndpoint,
} from './provider.mjs';
import { startMockServer, synthesize } from './mock.mjs';

const fresh = () => openDatabase(':memory:');

/** 起模拟服务 + 指向它的适配层；用完自动清理。 */
async function withProvider(fn, mockOptions = {}, providerOptions = {}) {
  const mock = await startMockServer(mockOptions);
  try {
    const provider = createProvider({
      baseUrl: mock.baseUrl,
      model: 'mock-model',
      ...providerOptions,
    });
    await fn({ provider, mock });
  } finally {
    await mock.close();
  }
}

// ─────────────────────── 隐私边界 ───────────────────────

test('本机端点判定正确', () => {
  for (const url of [
    'http://127.0.0.1:1234/v1',
    'http://localhost:1234/v1',
    'http://[::1]:1234/v1',
  ]) {
    assert.equal(isLocalEndpoint(url), true, url);
  }
  for (const url of [
    'https://api.openai.com/v1',
    'http://192.168.1.5:1234/v1',
    'https://evil.example.com/v1',
  ]) {
    assert.equal(isLocalEndpoint(url), false, url);
  }
});

test('默认拒绝向非本机端点发送内容', () => {
  assert.throws(
    () => assertEndpointAllowed('https://api.openai.com/v1'),
    /拒绝向非本机端点/,
  );
});

test('显式 allowRemote 才放行外部端点', () => {
  assert.doesNotThrow(() =>
    assertEndpointAllowed('https://api.example.com/v1', { allowRemote: true }),
  );
});

test('createProvider 构造时即校验端点', () => {
  assert.throws(
    () => createProvider({ baseUrl: 'https://api.openai.com/v1' }),
    /拒绝向非本机端点/,
  );
});

test('拒绝非 http(s) 协议', () => {
  assert.throws(
    () => assertEndpointAllowed('file:///etc/passwd', { allowRemote: true }),
    /协议不受支持/,
  );
  assert.throws(() => assertEndpointAllowed('不是 URL'), /不是合法 URL/);
});

// ─────────────────────── 适配层 ───────────────────────

test('列出模型', async () => {
  await withProvider(async ({ provider }) => {
    assert.deepEqual(await provider.listModels(), ['mock-model']);
  });
});

test('对话补全返回内容与用量', async () => {
  await withProvider(async ({ provider }) => {
    const result = await provider.chat([{ role: 'user', content: '你好' }]);
    assert.match(result.content, /模拟推理/);
    assert.equal(result.model, 'mock-model');
    assert.ok(result.usage);
  });
});

test('空 messages 被拒绝', async () => {
  await withProvider(async ({ provider }) => {
    await assert.rejects(() => provider.chat([]), /不能为空/);
  });
});

test('端点不可达时给出可执行的提示，而不是裸的连接错误', async () => {
  const provider = createProvider({
    baseUrl: 'http://127.0.0.1:9/v1', // 丢弃端口，必然连不上
    timeoutMs: 2000,
  });
  await assert.rejects(() => provider.listModels(), /确认本地推理服务已启动/);
});

test('端点返回非 200 时不把响应体外泄', async () => {
  await withProvider(
    async ({ provider }) => {
      await assert.rejects(
        () => provider.chat([{ role: 'user', content: 'x' }]),
        /返回 500/,
      );
    },
    { failWith: 500 },
  );
});

test('端点返回缺字段时明确报错，而不是静默返回 undefined', async () => {
  // 直接用一个返回空对象的假 fetch
  const provider = createProvider({
    baseUrl: 'http://127.0.0.1:1234/v1',
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
  });
  await assert.rejects(
    () => provider.chat([{ role: 'user', content: 'x' }]),
    /没有 choices\[0\]\.message\.content/,
  );
});

// ─────────────────────── 模拟服务 ───────────────────────

test('模拟回答是可预测的，便于断言', () => {
  const out = synthesize([
    { role: 'system', content: '以下是知识库引用：A' },
    { role: 'user', content: '四个字' },
  ]);
  assert.match(out, /模拟推理/);
  assert.match(out, /2 条消息/);
  assert.match(out, /附带了? 1 段知识库引用/);
});

test('模拟服务对非法 JSON 返回 400', async () => {
  const mock = await startMockServer();
  try {
    const res = await fetch(`${mock.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{坏',
    });
    assert.equal(res.status, 400);
  } finally {
    await mock.close();
  }
});

// ─────────────────────── 对话存储 ───────────────────────

test('创建对话并追加消息', () => {
  const db = fresh();
  const conv = createConversation(db, { model: 'mock-model' });
  addMessage(db, conv.id, { role: 'user', content: '麻将 AI 怎么评估？' });
  addMessage(db, conv.id, { role: 'assistant', content: '【模拟推理】…' });

  const full = getConversation(db, conv.id);
  assert.equal(full.messages.length, 2);
  assert.equal(full.messages[0].role, 'user');
  db.close();
});

test('首条用户消息自动成为对话标题', () => {
  const db = fresh();
  const conv = createConversation(db);
  addMessage(db, conv.id, { role: 'user', content: '关于线性代数的一个问题' });
  assert.equal(getConversation(db, conv.id).title, '关于线性代数的一个问题');
  db.close();
});

test('引用被持久化，可事后追溯', () => {
  const db = fresh();
  const conv = createConversation(db);
  addMessage(db, conv.id, {
    role: 'assistant',
    content: '回答',
    citations: ['note-1', 'note-2'],
  });
  assert.deepEqual(getConversation(db, conv.id).messages[0].citations, [
    'note-1',
    'note-2',
  ]);
  db.close();
});

test('拒绝未知 role 与不存在的对话', () => {
  const db = fresh();
  const conv = createConversation(db);
  assert.throws(
    () => addMessage(db, conv.id, { role: 'robot', content: 'x' }),
    /未知的 role/,
  );
  assert.throws(
    () => addMessage(db, 'nope', { role: 'user', content: 'x' }),
    /对话不存在/,
  );
  db.close();
});

test('删除对话会级联删除消息', () => {
  const db = fresh();
  const conv = createConversation(db);
  addMessage(db, conv.id, { role: 'user', content: 'x' });
  assert.equal(deleteConversation(db, conv.id), true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM messages').get().c, 0);
  db.close();
});

test('对话列表按更新时间倒序', async () => {
  const db = fresh();
  const a = createConversation(db, { title: '较早' });
  await new Promise((r) => setTimeout(r, 5));
  const b = createConversation(db, { title: '较新' });
  addMessage(db, a.id, { role: 'user', content: '触发 a 更新' });

  const list = listConversations(db);
  assert.equal(list[0].id, a.id, '刚更新过的应排最前');
  assert.ok(list.some((c) => c.id === b.id));
  db.close();
});

// ─────────────────── AI 回答只能变成草稿 ───────────────────

test('AI 回答存为草稿时带 ai_draft 标记', () => {
  const db = fresh();
  const conv = createConversation(db);
  const msg = addMessage(db, conv.id, {
    role: 'assistant',
    content: '这是模型的回答',
    citations: ['note-9'],
  });

  const note = saveAnswerAsDraft(db, {
    conversationId: conv.id,
    messageId: msg.id,
  });
  assert.equal(note.origin, 'ai_draft');
  assert.equal(note.status, 'draft');
  assert.match(getNote(db, note.id).body, /引用自/);
  assert.match(getNote(db, note.id).body, /note-9/);
  db.close();
});

test('只有 assistant 的消息能存为草稿', () => {
  const db = fresh();
  const conv = createConversation(db);
  const msg = addMessage(db, conv.id, { role: 'user', content: '我自己写的' });
  assert.throws(
    () => saveAnswerAsDraft(db, { conversationId: conv.id, messageId: msg.id }),
    /只有 AI 的回答/,
  );
  db.close();
});

test('草稿经人工编辑后转为 human', async () => {
  const db = fresh();
  const conv = createConversation(db);
  const msg = addMessage(db, conv.id, { role: 'assistant', content: '回答' });
  const draft = saveAnswerAsDraft(db, {
    conversationId: conv.id,
    messageId: msg.id,
  });
  assert.equal(getNote(db, draft.id).origin, 'ai_draft');

  const { updateNote } = await import('../db/store.mjs');
  const edited = updateNote(db, draft.id, { body: '我改过了' });
  assert.equal(edited.origin, 'human', '人工编辑后不应再标为 AI 起草');
  db.close();
});
