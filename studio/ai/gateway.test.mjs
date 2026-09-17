// 供应商中立网关测试（AI-001）。
//
// 验收要求「至少两个 OpenAI-compatible 或不同供应商 fixture」。
// 这里刻意让两个 fixture **行为不同**（一个回 usage、一个不回；
// 一个稳定、一个前两次失败）—— 两个一模一样的假端点证明不了中立性，
// 只能证明「同一段代码跑两遍结果一样」。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  createProfile,
  createGateway,
  isRetryable,
  CAPABILITIES,
} from './gateway.mjs';

/** fixture A：标准的 OpenAI 兼容端点，回 usage。 */
function startStandard({ models = ['mock-a'] } = {}) {
  const hits = { chat: 0 };
  const server = http.createServer((req, res) => {
    const send = (s, b) => {
      res.writeHead(s, { 'content-type': 'application/json' });
      res.end(JSON.stringify(b));
    };
    if (req.url === '/v1/models') {
      return send(200, { data: models.map((id) => ({ id })) });
    }
    if (req.url === '/v1/chat/completions') {
      hits.chat++;
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = JSON.parse(raw);
        send(200, {
          model: body.model,
          choices: [{ message: { role: 'assistant', content: '来自 A' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      });
      return;
    }
    send(404, { error: { message: 'not found' } });
  });
  return { server, hits };
}

/**
 * fixture B：行为与 A 不同 ——
 *   · 前 `failTimes` 次返回 503，之后成功
 *   · **不回 usage**（本地小模型常见）
 */
function startFlaky({ failTimes = 0 } = {}) {
  let seen = 0;
  const hits = { chat: 0 };
  const server = http.createServer((req, res) => {
    const send = (s, b) => {
      res.writeHead(s, { 'content-type': 'application/json' });
      res.end(JSON.stringify(b));
    };
    if (req.url === '/v1/chat/completions') {
      hits.chat++;
      seen++;
      if (seen <= failTimes)
        return send(503, { error: { message: '暂时不可用' } });
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        // 刻意不回 usage
        send(200, {
          choices: [{ message: { role: 'assistant', content: '来自 B' } }],
        });
      });
      return;
    }
    send(404, {});
  });
  return {
    server,
    hits,
    reset: () => {
      seen = 0;
    },
  };
}

async function withServers(fn) {
  const a = startStandard();
  const b = startFlaky();
  await new Promise((r) => a.server.listen(0, '127.0.0.1', r));
  await new Promise((r) => b.server.listen(0, '127.0.0.1', r));
  try {
    return await fn({
      a,
      b,
      urlA: `http://127.0.0.1:${a.server.address().port}/v1`,
      urlB: `http://127.0.0.1:${b.server.address().port}/v1`,
    });
  } finally {
    a.server.close();
    b.server.close();
  }
}

// ── 能力抽象 ──

test('能力必须显式声明', () => {
  assert.throws(
    () => createProfile({ name: 'x', baseUrl: 'http://127.0.0.1:1/v1' }),
    /显式声明能力/,
  );
  assert.throws(
    () =>
      createProfile({
        name: 'x',
        baseUrl: 'http://127.0.0.1:1/v1',
        capabilities: [],
      }),
    /显式声明能力/,
  );
  assert.throws(
    () =>
      createProfile({
        name: 'x',
        baseUrl: 'http://127.0.0.1:1/v1',
        capabilities: ['能唱歌'],
      }),
    /不认识的能力/,
  );
});

test('按能力挑供应商，而不是按配置顺序拿第一个', () => {
  const chatOnly = createProfile({
    name: '只会聊天',
    baseUrl: 'http://127.0.0.1:1/v1',
    capabilities: ['chat'],
  });
  const embedder = createProfile({
    name: '只会嵌入',
    baseUrl: 'http://127.0.0.1:2/v1',
    capabilities: ['embeddings'],
  });
  const gw = createGateway({ profiles: [chatOnly, embedder] });

  assert.equal(gw.pick(null, 'chat').name, '只会聊天');
  assert.equal(
    gw.pick(null, 'embeddings').name,
    '只会嵌入',
    '不该拿第一个顶替',
  );
});

test('向不具备该能力的供应商要东西 → 说明它会什么', () => {
  const gw = createGateway({
    profiles: [
      createProfile({
        name: '本地小模型',
        baseUrl: 'http://127.0.0.1:1/v1',
        capabilities: ['chat'],
      }),
    ],
  });
  assert.throws(
    () => gw.pick('本地小模型', 'embeddings'),
    /不具备「embeddings」能力.*支持的是：chat/,
    '要说清它有什么，而不是只说「不行」',
  );
});

test('一个能用的都没有时列出全部配置', () => {
  const gw = createGateway({
    profiles: [
      createProfile({
        name: 'A',
        baseUrl: 'http://127.0.0.1:1/v1',
        capabilities: ['chat'],
      }),
    ],
  });
  assert.throws(
    () => gw.pick(null, 'embeddings'),
    /没有任何已配置的供应商支持/,
  );
});

test('未知供应商名报错并列出可用的', () => {
  const gw = createGateway({
    profiles: [
      createProfile({
        name: 'A',
        baseUrl: 'http://127.0.0.1:1/v1',
        capabilities: ['chat'],
      }),
    ],
  });
  assert.throws(() => gw.pick('B', 'chat'), /没有这个供应商.*已配置的：A/);
});

// ── 两个行为不同的 fixture ──

test('两个 fixture 都能聊，且都能分辨出是谁答的', async () => {
  await withServers(async ({ urlA, urlB }) => {
    const gw = createGateway({
      profiles: [
        createProfile({
          name: 'A',
          baseUrl: urlA,
          model: 'ma',
          capabilities: ['chat'],
        }),
        createProfile({
          name: 'B',
          baseUrl: urlB,
          model: 'mb',
          capabilities: ['chat'],
        }),
      ],
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });

    const a = await gw.chat([{ role: 'user', content: 'hi' }], {
      provider: 'A',
    });
    const b = await gw.chat([{ role: 'user', content: 'hi' }], {
      provider: 'B',
    });

    assert.equal(a.content, '来自 A');
    assert.equal(a.provider, 'A');
    assert.equal(b.content, '来自 B');
    assert.equal(b.provider, 'B');
  });
});

test('端点不回 usage 时给 null，而不是编一个 0', async () => {
  await withServers(async ({ urlA, urlB }) => {
    const gw = createGateway({
      profiles: [
        createProfile({ name: 'A', baseUrl: urlA, capabilities: ['chat'] }),
        createProfile({ name: 'B', baseUrl: urlB, capabilities: ['chat'] }),
      ],
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });

    const withUsage = await gw.chat([{ role: 'user', content: 'x' }], {
      provider: 'A',
    });
    const without = await gw.chat([{ role: 'user', content: 'x' }], {
      provider: 'B',
    });

    assert.deepEqual(withUsage.usage, {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    assert.equal(
      without.usage,
      null,
      '「没上报」与「真的用了 0」必须能分辨 —— 用 0 会让两者长得一样',
    );
  });
});

test('用量按供应商分开累计，并记下「没上报」的次数', async () => {
  await withServers(async ({ urlA, urlB }) => {
    const gw = createGateway({
      profiles: [
        createProfile({ name: 'A', baseUrl: urlA, capabilities: ['chat'] }),
        createProfile({ name: 'B', baseUrl: urlB, capabilities: ['chat'] }),
      ],
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });

    await gw.chat([{ role: 'user', content: 'x' }], { provider: 'A' });
    await gw.chat([{ role: 'user', content: 'x' }], { provider: 'A' });
    await gw.chat([{ role: 'user', content: 'x' }], { provider: 'B' });

    const u = gw.usage();
    assert.equal(u.A.requests, 2);
    assert.equal(u.A.totalTokens, 30);
    assert.equal(u.B.requests, 1);
    assert.equal(u.B.totalTokens, 0);
    assert.equal(u.B.missingUsage, 1, '没上报的次数要单独记');
  });
});

// ── 重试 ──

test('5xx 会被重试，最终成功', async () => {
  await withServers(async ({ urlB, b }) => {
    b.reset();
    const flaky = startFlaky({ failTimes: 2 });
    await new Promise((r) => flaky.server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${flaky.server.address().port}/v1`;

    const gw = createGateway({
      profiles: [
        createProfile({ name: 'F', baseUrl: url, capabilities: ['chat'] }),
      ],
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
      random: () => 0,
    });

    const r = await gw.chat([{ role: 'user', content: 'x' }], {
      provider: 'F',
    });
    assert.equal(r.content, '来自 B');
    assert.equal(gw.usage().F.retries, 2, '两次失败各重试一次');
    assert.equal(gw.usage().F.failures, 0, '最终成功就不算失败');
    flaky.server.close();
  });
});

test('重试用尽后如实报失败，并记进用量', async () => {
  await withServers(async ({ urlB }) => {
    const gw = createGateway({
      profiles: [
        createProfile({ name: 'B', baseUrl: urlB, capabilities: ['chat'] }),
      ],
      retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
      random: () => 0,
    });
    // B 的 failTimes 默认 0，这里改用 permanently-failing 的端点
    const always = startFlaky({ failTimes: 99 });
    await new Promise((r) => always.server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${always.server.address().port}/v1`;

    const gw2 = createGateway({
      profiles: [
        createProfile({ name: 'P', baseUrl: url, capabilities: ['chat'] }),
      ],
      retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
      random: () => 0,
    });

    await assert.rejects(
      () => gw2.chat([{ role: 'user', content: 'x' }], { provider: 'P' }),
      /503/,
    );
    assert.equal(gw2.usage().P.failures, 1);
    assert.equal(gw2.usage().P.retries, 1);
    always.server.close();
    assert.ok(gw);
  });
});

test('4xx 不重试 —— 请求本身有问题，再发十次也一样', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"bad"}}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const counts = { n: 0 };
  server.on('request', () => counts.n++);

  const gw = createGateway({
    profiles: [
      createProfile({
        name: 'X',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        capabilities: ['chat'],
      }),
    ],
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    random: () => 0,
  });

  await assert.rejects(
    () => gw.chat([{ role: 'user', content: 'x' }], { provider: 'X' }),
    /400/,
  );
  assert.equal(counts.n, 1, '只发一次');
  assert.equal(gw.usage().X.retries, 0);
  server.close();
});

test('isRetryable 的分类', () => {
  assert.equal(isRetryable({ status: 429 }), true);
  assert.equal(isRetryable({ status: 500 }), true);
  assert.equal(isRetryable({ status: 503 }), true);
  assert.equal(isRetryable({ status: 400 }), false);
  assert.equal(isRetryable({ status: 401 }), false);
  assert.equal(isRetryable({ status: 404 }), false);
  assert.equal(isRetryable({ name: 'AbortError' }), false, '取消不是失败');
  assert.equal(
    isRetryable(new Error('网络')),
    true,
    '没有状态码的当作网络层问题',
  );
});

// ── 取消 ──

test('取消后立刻停，且不报成失败', async () => {
  const server = http.createServer(() => {
    /* 永不响应 */
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const gw = createGateway({
    profiles: [
      createProfile({
        name: '慢',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        capabilities: ['chat'],
        timeoutMs: 10_000,
      }),
    ],
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    random: () => 0,
  });

  const controller = new AbortController();
  const p = gw.chat([{ role: 'user', content: 'x' }], {
    provider: '慢',
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);

  await assert.rejects(p, (e) => {
    assert.equal(e.name, 'AbortError');
    assert.match(e.message, /已取消/);
    return true;
  });
  assert.equal(gw.usage().慢.retries, 0, '取消不该触发重试');
  server.close();
});

test('超时被报成超时，并可重试', async () => {
  const server = http.createServer(() => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const gw = createGateway({
    profiles: [
      createProfile({
        name: '慢',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        capabilities: ['chat'],
        timeoutMs: 20,
      }),
    ],
    retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 2 },
    random: () => 0,
  });

  await assert.rejects(
    () => gw.chat([{ role: 'user', content: 'x' }], { provider: '慢' }),
    /超时（20ms）/,
  );
  server.close();
});

// ── 隐私边界 ──

test('非本机端点必须显式放行，且**在定义时**就检查', () => {
  assert.throws(
    () =>
      createProfile({
        name: '远端',
        baseUrl: 'https://api.example.com/v1',
        capabilities: ['chat'],
      }),
    /只允许本机|allowRemote/,
    '越早失败越不容易被忽略 —— 不该等到第一次请求',
  );
  assert.ok(
    createProfile({
      name: '远端',
      baseUrl: 'https://api.example.com/v1',
      capabilities: ['chat'],
      allowRemote: true,
    }),
  );
});

test('CAPABILITIES 只有用得到的那几个', () => {
  assert.deepEqual(CAPABILITIES, ['chat', 'embeddings', 'models']);
});

test('空 messages 被拒绝', async () => {
  const gw = createGateway({
    profiles: [
      createProfile({
        name: 'A',
        baseUrl: 'http://127.0.0.1:1/v1',
        capabilities: ['chat'],
      }),
    ],
  });
  await assert.rejects(() => gw.chat([]), /messages 不能为空/);
});
