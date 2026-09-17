// 受限访问身份测试（ACCESS-001）。
//
// 这一层的验收是一句否定句：「未授权方不得通过搜索、摘要、向量接口或
// AI 对话获得私人内容」。否定句只能靠**逐条去够**来验证 ——
// 所以下面的用例按「一个只有 x 能力的身份去够 y」组织，
// 而不是只测「它有 x 时能用 x」。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../db/schema.mjs';
import { createNote, proposeMemory, reviewMemory } from '../db/store.mjs';
import {
  createToken,
  verifyToken,
  revokeToken,
  rotateToken,
  listTokens,
  getToken,
  logAccess,
  recentAccess,
  requiredScope,
  scopeAllows,
  PRESETS,
} from './tokens.mjs';
import { createServer, loadOrCreateToken } from '../server/index.mjs';

const fresh = () => openDatabase(':memory:');

// ── 令牌本身 ──

test('创建返回明文令牌，而库里只有哈希', () => {
  const db = fresh();
  const { token, record } = createToken(db, {
    label: '测试',
    scopes: ['read:search'],
  });
  assert.ok(token.length > 20);

  const row = db
    .prepare('SELECT * FROM access_tokens WHERE id = ?')
    .get(record.id);
  assert.notEqual(row.token_hash, token, '库里不该有明文');
  assert.equal(row.token_hash.length, 64, 'sha256 十六进制');
  assert.ok(!JSON.stringify(row).includes(token), '整行序列化后也不该出现明文');
  db.close();
});

test('scopes 为空 = 什么都不能做（默认拒绝）', () => {
  const db = fresh();
  const { token } = createToken(db, { label: '空', scopes: [] });
  const id = verifyToken(db, token);
  assert.deepEqual(id.scopes, []);
  assert.equal(scopeAllows(id, 'GET', '/api/notes'), false);
  assert.equal(scopeAllows(id, 'GET', '/api/search'), false);
  db.close();
});

test('未知能力被拒绝，不静默忽略', () => {
  const db = fresh();
  assert.throws(
    () => createToken(db, { label: 'x', scopes: ['read:everything'] }),
    /未知的能力/,
  );
  db.close();
});

test('令牌必须有用途说明', () => {
  const db = fresh();
  assert.throws(() => createToken(db, { label: '  ', scopes: [] }), /用途说明/);
  db.close();
});

test('校验：错的、空的、非字符串一律返回 null', () => {
  const db = fresh();
  createToken(db, { label: 'x', scopes: ['read:search'] });
  for (const bad of ['', 'nope', null, undefined, 42, {}]) {
    assert.equal(verifyToken(db, bad), null);
  }
  db.close();
});

test('撤销后立刻失效；撤销不删行，审计才连得上', () => {
  const db = fresh();
  const { token, record } = createToken(db, {
    label: 'x',
    scopes: ['read:search'],
  });
  assert.ok(verifyToken(db, token));

  assert.equal(revokeToken(db, record.id), true);
  assert.equal(verifyToken(db, token), null, '撤销后必须立刻不认');
  assert.ok(getToken(db, record.id), '行要留着，否则审计里的 token_id 指向空');
  assert.equal(getToken(db, record.id).active, false);
  assert.equal(revokeToken(db, record.id), false, '重复撤销返回 false');
  db.close();
});

test('过期的令牌不认', () => {
  const db = fresh();
  const past = new Date(Date.now() - 1000).toISOString();
  const { token } = createToken(db, {
    label: 'x',
    scopes: ['read:search'],
    expiresAt: past,
  });
  assert.equal(verifyToken(db, token), null);
  db.close();
});

test('轮换：新的能用，旧的立刻作废，且沿用同样的 label 与 scopes', () => {
  const db = fresh();
  const { token: oldToken, record } = createToken(db, {
    label: '外部 AI',
    scopes: PRESETS.reader,
  });
  const { token: newToken, record: newRecord } = rotateToken(db, record.id);

  assert.equal(verifyToken(db, oldToken), null, '旧的必须失效');
  const id = verifyToken(db, newToken);
  assert.deepEqual(id.scopes, PRESETS.reader);
  assert.equal(newRecord.label, '外部 AI');
  assert.notEqual(newRecord.id, record.id, '轮换是新行，旧行保留撤销时间');
  db.close();
});

test('listTokens 与 getToken 都不含明文也不含哈希', () => {
  const db = fresh();
  const { token } = createToken(db, { label: 'x', scopes: ['read:search'] });
  const blob = JSON.stringify(listTokens(db));
  assert.ok(!blob.includes(token));
  assert.ok(!blob.includes('token_hash'));
  db.close();
});

// ── 路径 → 能力 ──

test('未分类的路径一律要求 admin（默认拒绝的那一行）', () => {
  assert.equal(requiredScope('GET', '/api/health'), null, '健康检查不泄露内容');
  assert.equal(requiredScope('GET', '/api/search'), 'read:search');
  assert.equal(requiredScope('GET', '/api/search-all'), 'read:search');
  assert.equal(requiredScope('GET', '/api/notes'), 'read:notes');
  assert.equal(requiredScope('GET', '/api/notes/abc'), 'read:notes');
  assert.equal(requiredScope('POST', '/api/notes'), 'write:draft');
  assert.equal(requiredScope('GET', '/api/memories'), 'read:memories');

  // 这几条是**故意**要 admin 的：它们会把私人内容送出去或改变状态
  assert.equal(requiredScope('POST', '/api/memories/x/review'), 'admin');
  assert.equal(requiredScope('GET', '/api/conversations'), 'admin');
  assert.equal(requiredScope('POST', '/api/conversations/x/messages'), 'admin');
  assert.equal(requiredScope('GET', '/api/settings'), 'admin');
  assert.equal(requiredScope('PUT', '/api/settings'), 'admin');

  // 将来加的新路由忘了分类时，必须落在 admin 这一侧
  assert.equal(requiredScope('GET', '/api/未来才有的端点'), 'admin');
  assert.equal(requiredScope('DELETE', '/api/什么都不是'), 'admin');
});

test('审计只记方法与路径，不记查询串里的值', () => {
  const db = fresh();
  const { record } = createToken(db, { label: 'x', scopes: ['read:search'] });
  logAccess(db, {
    tokenId: record.id,
    method: 'GET',
    path: '/api/search',
    allowed: true,
  });

  const rows = recentAccess(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenLabel, 'x', '要能看出是哪个身份');
  assert.ok(!('q' in rows[0]), '不该有查询串字段');
  db.close();
});

// ── HTTP 层：一个受限身份去够各种东西 ──

async function withServer(fn) {
  const home = mkdtempSync(join(tmpdir(), 'access-'));
  const ownerToken = loadOrCreateToken(home);
  const db = openDatabase(':memory:');

  // 塞一点「私人内容」进去，供越权尝试
  const note = createNote(db, {
    title: '私人笔记',
    body: '机密正文',
    tags: ['私'],
  });
  const mem = proposeMemory(db, { content: '用户的私人偏好' });
  reviewMemory(db, mem.id, 'approved');

  const server = createServer({ db, token: ownerToken, home, provider: null });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const request = (path, { method = 'GET', token, body } = {}) =>
    new Promise((resolve, reject) => {
      const headers = { host: `127.0.0.1:${port}` };
      if (token) headers.authorization = `Bearer ${token}`;
      if (body) headers['content-type'] = 'application/json';
      const req = http.request(
        { host: '127.0.0.1', port, path, method, headers },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });

  try {
    return await fn({ request, db, noteId: note.id, ownerToken });
  } finally {
    server.close();
    db.close();
    rmSync(home, { recursive: true, force: true });
  }
}

test('只有 read:search 的身份：能搜，但读不到全文、读不到记忆、进不了对话', async () => {
  await withServer(async ({ request, db }) => {
    const { token } = createToken(db, {
      label: 'searcher',
      scopes: PRESETS.searcher,
    });

    assert.equal(
      (await request('/api/search?q=' + encodeURIComponent('私人'), { token }))
        .status,
      200,
      '搜是它被允许的',
    );
    assert.equal(
      (await request('/api/notes', { token })).status,
      403,
      '读列表要 read:notes',
    );
    assert.equal(
      (await request('/api/memories', { token })).status,
      403,
      '读记忆要 read:memories',
    );
    assert.equal(
      (await request('/api/conversations', { token })).status,
      403,
      '对话是管理面',
    );
    assert.equal(
      (await request('/api/settings', { token })).status,
      403,
      '配置是管理面',
    );
  });
});

test('写入只进待审核草稿：能建，但建出来的不是已确认内容', async () => {
  await withServer(async ({ request, db }) => {
    const { token } = createToken(db, {
      label: 'drafter',
      scopes: PRESETS.drafter,
    });
    const res = await request('/api/notes', {
      method: 'POST',
      token,
      body: JSON.stringify({ title: '外部 AI 写的', body: '内容' }),
    });
    assert.equal(res.status, 201);
    const { note } = JSON.parse(res.body);
    assert.equal(note.origin, 'ai_draft', '受限身份的写入必须标记为 AI 起草');
    assert.equal(note.status, 'draft', '不能直接成为正式内容');
  });
});

test('受限身份不能删除、不能审核记忆', async () => {
  await withServer(async ({ request, db, noteId }) => {
    const { token } = createToken(db, {
      label: 'drafter',
      scopes: PRESETS.drafter,
    });
    assert.equal(
      (await request(`/api/notes/${noteId}`, { method: 'DELETE', token }))
        .status,
      403,
    );

    const pending = proposeMemory(db, { content: '待审核' });
    assert.equal(
      (
        await request(`/api/memories/${pending.id}/review`, {
          method: 'POST',
          token,
          body: JSON.stringify({ decision: 'approved' }),
        })
      ).status,
      403,
      '让 AI 自己批准自己提的东西，等于审核门禁不存在',
    );
  });
});

test('主令牌仍然全权 —— 收紧不能把用户自己锁在外面', async () => {
  await withServer(async ({ request, ownerToken }) => {
    for (const p of [
      '/api/notes',
      '/api/memories',
      '/api/conversations',
      '/api/settings',
    ]) {
      assert.equal(
        (await request(p, { token: ownerToken })).status,
        200,
        `主令牌访问 ${p} 不该被拦`,
      );
    }
  });
});

test('没有令牌是 401，受限身份越权是 403 —— 两者含义不同', async () => {
  await withServer(async ({ request, db }) => {
    assert.equal((await request('/api/notes')).status, 401, '没有凭据');
    const { token } = createToken(db, { label: 'x', scopes: [] });
    assert.equal(
      (await request('/api/notes', { token })).status,
      403,
      '有身份但不够权限',
    );
  });
});

test('越权尝试会被记进审计，包括被拒的那些', async () => {
  await withServer(async ({ request, db }) => {
    const { record, token } = createToken(db, {
      label: '外部 AI',
      scopes: PRESETS.searcher,
    });
    await request('/api/notes', { token });
    await request('/api/search?q=x', { token });

    const rows = recentAccess(db, { limit: 10 });
    const denied = rows.filter((r) => !r.allowed);
    assert.equal(denied.length, 1, '被拒的那次必须留下记录');
    assert.equal(denied[0].path, '/api/notes');
    assert.equal(denied[0].tokenLabel, '外部 AI');
    assert.ok(
      rows.some((r) => r.allowed),
      '放行的那次也记',
    );
    assert.ok(record.id);
  });
});

test('撤销之后立刻连搜索都进不去', async () => {
  await withServer(async ({ request, db }) => {
    const { token, record } = createToken(db, {
      label: 'x',
      scopes: PRESETS.reader,
    });
    assert.equal((await request('/api/search?q=x', { token })).status, 200);
    revokeToken(db, record.id);
    assert.equal((await request('/api/search?q=x', { token })).status, 401);
  });
});

// ── 选区 patch 的能力归属（EDITOR-002 × ACCESS-001）──
//
// patch 会**改写已有内容**，不是「提一条草稿」。所以它必须落在 admin 一侧 ——
// 一个「可以提草稿」的外部身份不该能借这个接口改掉用户的正文。

test('选区 patch 需要 admin，write:draft 不够', () => {
  assert.equal(requiredScope('POST', '/api/notes/abc/patch'), 'admin');
  assert.equal(requiredScope('PUT', '/api/notes/abc/patch'), 'admin');
  assert.equal(
    scopeAllows({ scopes: PRESETS.drafter }, 'POST', '/api/notes/abc/patch'),
    false,
    '能提草稿 ≠ 能改正文',
  );
});
