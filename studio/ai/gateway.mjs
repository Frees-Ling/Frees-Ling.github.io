// 供应商中立的网关（AI-001）。
//
// KB-003 已经有一个 OpenAI 兼容适配层，但它是**一个端点一个实例**：
// 没有「这家能做什么」的概念，失败就失败，用量看过就算。
// 这一层补三件事：
//
//   · 能力声明 —— 端点说自己能做什么，请求方按能力要，而不是按端点名硬编码
//   · 重试     —— 只重试**可能自己好起来**的失败，且不重试已经太迟的
//   · 用量     —— 看得见花了多少，而不是每次请求各看各的
//
// ── 为什么「能力」是个真问题 ──
//
// 本地模型与云端的差别不只是地址：有的没有嵌入端点，有的不支持工具调用，
// 有的连 /v1/models 都没有。靠调用方「反正都调，不行再说」的话，
// 失败会以「端点返回 404」这种形式出现 —— 而那既不好懂，
// 也没告诉你**该换哪一家**。
//
// 声明能力之后，不支持的请求在**发出去之前**就被拒绝，并说明这个端点会什么。

import { assertEndpointAllowed } from './provider.mjs';

/** 网关认识的能力。刻意只有三个 —— 用不到的先不加。 */
export const CAPABILITIES = ['chat', 'embeddings', 'models'];

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY = { attempts: 3, baseDelayMs: 300, maxDelayMs: 5_000 };

/**
 * 定义一个供应商。
 *
 * `capabilities` **必填且必须显式列出** —— 默认给「什么都会」很方便，
 * 但那等于把「这家其实没有嵌入端点」这件事藏到第一次调用失败为止。
 */
export function createProfile({
  name,
  baseUrl,
  model,
  capabilities,
  allowRemote = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!name) throw new Error('供应商需要名字');
  if (!baseUrl) throw new Error(`${name} 缺少 baseUrl`);
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    throw new Error(
      `${name} 必须显式声明能力 —— ` +
        '默认「什么都会」会把「这家没有嵌入端点」藏到第一次调用失败为止',
    );
  }
  const unknown = capabilities.filter((c) => !CAPABILITIES.includes(c));
  if (unknown.length) {
    throw new Error(`${name} 声明了不认识的能力：${unknown.join(', ')}`);
  }

  // 隐私边界在**定义时**就检查，而不是等第一次请求 ——
  // 越早失败越不容易被忽略
  assertEndpointAllowed(baseUrl, { allowRemote });

  return Object.freeze({
    name,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model: model ?? 'local-model',
    capabilities: Object.freeze([...capabilities]),
    timeoutMs,
  });
}

/**
 * 判断一次失败是否值得重试。
 *
 * **只重试「可能自己好起来」的**：网络抖动、限流、服务端 5xx。
 * 4xx（除 429）重试是纯粹的浪费 —— 请求本身有问题，再发十次也一样，
 * 而且会把一个立刻能报的错拖成几秒后才报。
 */
export function isRetryable(error) {
  if (error?.name === 'AbortError') return false; // 用户取消，不是失败
  if (error?.retryable !== undefined) return error.retryable;
  const status = error?.status;
  if (typeof status !== 'number') return true; // 网络层错（连不上、超时）
  return status === 429 || status >= 500;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 建一个网关。
 *
 * @param {object} options
 * @param {object[]} options.profiles 至少一个供应商定义
 * @param {Function} [options.fetchImpl] 便于测试注入
 * @param {object} [options.retry] 重试策略
 */
export function createGateway({
  profiles = [],
  fetchImpl = globalThis.fetch,
  retry = DEFAULT_RETRY,
  now = () => Date.now(),
  random = Math.random,
} = {}) {
  for (const p of profiles) assertEndpointAllowed(p.baseUrl, {});

  const byName = new Map(profiles.map((p) => [p.name, p]));
  const counters = new Map(); // 用量，按供应商分

  const usageFor = (name) => {
    if (!counters.has(name)) {
      counters.set(name, {
        requests: 0,
        failures: 0,
        retries: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    }
    return counters.get(name);
  };

  /**
   * 挑一个能做这件事的供应商。
   *
   * 不指定名字时取第一个具备该能力的 —— **而不是第一个**
   * （第一个可能恰好没有嵌入端点）。
   */
  function pick(providerName, capability) {
    if (providerName) {
      const p = byName.get(providerName);
      if (!p) {
        throw new Error(
          `没有这个供应商：${providerName}（已配置的：${[...byName.keys()].join(', ') || '无'}）`,
        );
      }
      if (!p.capabilities.includes(capability)) {
        throw new Error(
          `${providerName} 不具备「${capability}」能力，它支持的是：${p.capabilities.join(', ')}`,
        );
      }
      return p;
    }
    const candidate = profiles.find((p) => p.capabilities.includes(capability));
    if (!candidate) {
      throw new Error(
        `没有任何已配置的供应商支持「${capability}」。` +
          `已配置：${profiles.map((p) => `${p.name}(${p.capabilities.join('/')})`).join('、') || '无'}`,
      );
    }
    return candidate;
  }

  /** 发一次请求，带超时。 */
  async function once(profile, path, payload, signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), profile.timeoutMs);

    // 调用方的取消与超时都要能中止请求。
    // 用 `{ once: true }` 是因为一次请求只该被转发一次取消 ——
    // 不带的话，重复的 signal 事件会在长会话里把监听器堆积起来。
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetchImpl(`${profile.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        // 只校验了初始 URL；跟随重定向会把内容带到未经校验的地址
        redirect: 'error',
        signal: controller.signal,
      });

      if (!res.ok) {
        const error = new Error(`${profile.name} 返回 ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return await res.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        // 区分「用户取消」与「超时」：前者不该报成失败
        if (signal?.aborted) {
          const cancelled = new Error('请求已取消');
          cancelled.name = 'AbortError';
          throw cancelled;
        }
        const timeout = new Error(
          `${profile.name} 超时（${profile.timeoutMs}ms）`,
        );
        timeout.retryable = true;
        throw timeout;
      }
      if (error.message?.startsWith(`${profile.name} 返回`)) throw error;
      // 连不上、DNS、协议错都归到这里；它们通常是暂时的
      const network = new Error(
        `无法连接 ${profile.name}（${profile.baseUrl}）`,
      );
      network.retryable = true;
      throw network;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** 带重试的请求。 */
  async function call(profile, path, payload, signal) {
    const counter = usageFor(profile.name);
    let lastError;

    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      try {
        counter.requests++;
        return await once(profile, path, payload, signal);
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') throw error; // 取消不重试
        if (!isRetryable(error) || attempt === retry.attempts) break;

        counter.retries++;
        // 指数退避 + 抖动：固定间隔会让同时失败的多方在同一刻一起重试，
        // 把本该缓过来的服务再打一次
        const delay = Math.min(
          retry.maxDelayMs,
          retry.baseDelayMs * 2 ** (attempt - 1),
        );
        await sleep(delay * (0.5 + random() * 0.5));
      }
    }

    counter.failures++;
    throw lastError;
  }

  function countTokens(profile, usage) {
    const counter = usageFor(profile.name);
    // 有的端点不回 usage（本地小模型常见）。**不编一个数字出来** ——
    // 用 0 会让「这次没上报」和「这次真的用了 0」长得一样。
    if (!usage) {
      counter.missingUsage = (counter.missingUsage ?? 0) + 1;
      return null;
    }
    counter.promptTokens += Number(usage.prompt_tokens) || 0;
    counter.completionTokens += Number(usage.completion_tokens) || 0;
    counter.totalTokens += Number(usage.total_tokens) || 0;
    return usage;
  }

  return {
    profiles: [...profiles],
    pick,

    /** 这个供应商会什么。 */
    capabilitiesOf(name) {
      const p = byName.get(name);
      if (!p) throw new Error(`没有这个供应商：${name}`);
      return [...p.capabilities];
    },

    async chat(messages, { provider, signal, temperature = 0.7 } = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('messages 不能为空');
      }
      const profile = pick(provider, 'chat');
      const body = await call(
        profile,
        '/chat/completions',
        { model: profile.model, messages, temperature, stream: false },
        signal,
      );

      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error(`${profile.name} 的响应里没有内容`);
      }
      return {
        content,
        model: body.model || profile.model,
        provider: profile.name,
        // usage 可能是 null —— 调用方必须能分辨「没上报」与「用了 0」
        usage: countTokens(profile, body.usage),
      };
    },

    /** 用量快照。 */
    usage() {
      return Object.fromEntries(
        [...counters.entries()].map(([name, c]) => [name, { ...c }]),
      );
    },

    resetUsage() {
      counters.clear();
    },
  };
}
