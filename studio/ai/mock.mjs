// 模拟推理服务。
//
// 存在的理由：本机没有安装 LM Studio，而 AI Studio 的开发不该因此停摆。
// 它实现同一套 OpenAI 兼容协议，让适配层、对话历史、引用注入、草稿保存
// 这些**与模型无关**的部分可以先做完并测透。真实模型联调是后续一步，
// 换的只是 base URL。
//
// 它**不是**模型：不产生任何有意义的回答，只是按可预测的规则回显。
// 因此绝不能拿它的输出去验证「回答质量」这类事。

import http from 'node:http';

/** 可预测的合成回答：便于测试断言，也便于人一眼看出这是模拟的。 */
export function synthesize(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = last?.content ?? '';
  const citations = messages.filter(
    (m) => m.role === 'system' && /引用/.test(m.content),
  );
  return [
    `【模拟推理】收到 ${messages.length} 条消息。`,
    `最后一条用户输入共 ${text.length} 字。`,
    citations.length > 0
      ? `附带 ${citations.length} 段知识库引用。`
      : '没有附带引用。',
  ].join('');
}

export function createMockServer({
  models = ['mock-model'],
  failWith = null,
} = {}) {
  return http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (failWith) return send(failWith, { error: { message: '模拟失败' } });

    if (req.url === '/v1/models' && req.method === 'GET') {
      return send(200, { data: models.map((id) => ({ id, object: 'model' })) });
    }

    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return send(400, { error: { message: 'bad json' } });
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return send(400, { error: { message: 'messages required' } });
        }
        send(200, {
          model: body.model || 'mock-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: synthesize(body.messages),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      });
      return;
    }

    send(404, { error: { message: 'not found' } });
  });
}

/** 起一个模拟服务并返回 { baseUrl, close }。端口由系统分配，避免冲突。 */
export async function startMockServer(options = {}) {
  const server = createMockServer(options);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    server,
    close: () => new Promise((r) => server.close(r)),
  };
}
