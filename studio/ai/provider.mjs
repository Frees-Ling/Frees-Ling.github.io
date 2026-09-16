// 模型适配层。
//
// 面向 OpenAI 兼容的 /chat/completions 协议 —— 这是事实标准，
// LM Studio、Ollama、llama.cpp server、vLLM 以及大多数商业服务都提供它。
// 因此适配层不需要为每个供应商写一个分支，只需要能改 base URL 与模型名。
//
// ── 隐私边界（这是本模块最重要的约束）──
//
// 默认只允许连**本机**端点。向外部服务发送私人笔记必须是显式选择，
// 且必须经过 assertEndpointAllowed 的检查。理由：知识库里的内容是私人的，
// 「某次调试时顺手把 base URL 改成公网地址」不应该是一个静默可行的操作。

/** 判定端点是否为本机。 */
export function isLocalEndpoint(baseUrl) {
  try {
    const { hostname } = new URL(baseUrl);
    return (
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === 'localhost' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/**
 * 校验端点是否可用。
 *
 * @param {string} baseUrl
 * @param {{ allowRemote?: boolean }} options
 *   allowRemote 必须由调用方**显式**传入 true 才放行外部地址。
 */
export function assertEndpointAllowed(baseUrl, { allowRemote = false } = {}) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`端点不是合法 URL: ${baseUrl}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`端点协议不受支持: ${url.protocol}`);
  }
  if (!isLocalEndpoint(baseUrl) && !allowRemote) {
    throw new Error(
      `拒绝向非本机端点发送内容: ${url.hostname}。` +
        '如果确实要使用外部服务，必须显式开启 allowRemote —— ' +
        '私人笔记不应在无人察觉的情况下离开本机。',
    );
  }
  return url;
}

/** 模型配置。默认指向本机常见的 LM Studio 端口，但**不假设**它一定在运行。 */
export function createProvider({
  baseUrl = 'http://127.0.0.1:1234/v1',
  model = 'local-model',
  apiKey = '',
  allowRemote = false,
  timeoutMs = 60_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  assertEndpointAllowed(baseUrl, { allowRemote });

  return {
    baseUrl,
    model,
    allowRemote,

    /** 列出可用模型。端点不可达时抛出可读错误，不静默返回空数组。 */
    async listModels() {
      assertEndpointAllowed(baseUrl, { allowRemote });
      const res = await request(`${baseUrl}/models`, { method: 'GET' });
      const body = await res.json().catch(() => ({}));
      return (body.data || []).map((m) => m.id).filter(Boolean);
    },

    /**
     * 发起一次对话补全。
     *
     * @param {Array<{role: string, content: string}>} messages
     * @param {{ signal?: AbortSignal, temperature?: number }} options
     */
    async chat(messages, { signal, temperature = 0.7 } = {}) {
      assertEndpointAllowed(baseUrl, { allowRemote });
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('messages 不能为空');
      }

      const res = await request(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature, stream: false }),
        signal,
      });

      if (!res.ok) {
        // 不把响应体直接抛出：它可能回显请求内容，而请求里含私人笔记
        throw new Error(`模型端点返回 ${res.status}`);
      }

      const body = await res.json().catch(() => {
        throw new Error('模型端点返回的不是合法 JSON');
      });
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('模型端点返回的结构里没有 choices[0].message.content');
      }
      return { content, model: body.model || model, usage: body.usage || null };
    },
  };

  async function request(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        ...init,
        // 禁止自动跟随重定向。
        //
        // assertEndpointAllowed 只校验了**初始** URL。若本机端点返回 302
        // 指向外部主机，默认的 redirect:'follow' 会把请求（连同私人笔记）
        // 发到那个地址 —— 「内容不离开本机」这条保证就被静默绕过了。
        // 模型端点没有理由重定向，因此直接拒绝而不是手动跟进。
        redirect: 'error',
        signal: init.signal || controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`模型端点超时（${timeoutMs}ms）: ${url}`);
      }
      // 连不上是本机开发最常见的情况，给出可执行的提示而不是裸的 ECONNREFUSED
      throw new Error(
        `无法连接模型端点 ${url} —— 请确认本地推理服务已启动。原因: ${error.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
