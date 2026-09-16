// 嵌入与语义检索（KB-007）。
//
// 面向 OpenAI 兼容的 `/v1/embeddings` —— 与 provider.mjs 同样的理由：
// 这是事实标准，LM Studio / Ollama / llama.cpp / vLLM 都提供。
//
// ── 为什么不用向量数据库 ──
//
// 个人知识库的规模是几百到几千条。在 JS 里暴力算余弦相似度是毫秒级，
// 而引入 Qdrant/Milvus 意味着多一个服务、多一份备份负担、
// 多一种会过期的数据格式。规模真正变大时再换，那时也知道该换什么。
//
// ── 降级而非报错 ──
//
// 检索是基础功能。模型没启动时应该退回关键词检索，而不是整个不可用 ——
// 「因为没开 LM Studio 所以什么也搜不到」是不可接受的。

import { assertEndpointAllowed } from './provider.mjs';

export const DEFAULT_EMBEDDING_URL = 'http://127.0.0.1:1234/v1';

/**
 * 把 Float32Array 与 Buffer 互相转换。
 *
 * 存 BLOB 而不是 JSON 文本：JSON 会大 3–5 倍，且每次读写都要解析。
 * 这里刻意不用 Float64 —— 嵌入向量的精度远用不到双精度，
 * 而体积会翻倍。
 */
export function vectorToBlob(vector) {
  return Buffer.from(new Float32Array(vector).buffer);
}

export function blobToVector(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}

/** 余弦相似度。零向量返回 0 而不是 NaN —— NaN 会污染整个排序。 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`向量维度不一致: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 创建嵌入客户端。
 *
 * 与对话适配层共享同一条隐私边界：默认只允许本机端点。
 */
export function createEmbedder({
  baseUrl = DEFAULT_EMBEDDING_URL,
  model = 'nomic-embed-text-v1.5',
  allowRemote = false,
  timeoutMs = 30_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  assertEndpointAllowed(baseUrl, { allowRemote });

  return {
    baseUrl,
    model,

    /** 单条文本的嵌入。 */
    async embed(text) {
      const [vector] = await this.embedMany([text]);
      return vector;
    },

    /** 批量嵌入。 */
    async embedMany(texts) {
      assertEndpointAllowed(baseUrl, { allowRemote });
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('texts 不能为空');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
          // 与对话适配层同样的理由：只校验了初始 URL，
          // 跟随重定向会把内容带到未经校验的地址
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        if (error.name === 'AbortError')
          throw new Error(`嵌入端点超时（${timeoutMs}ms）`);
        throw new Error(
          `无法连接嵌入端点 ${baseUrl} —— 请确认本地推理服务已启动。`,
        );
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // 不回传响应体：它可能回显请求内容，而请求里含私人笔记
        throw new Error(`嵌入端点返回 ${res.status}`);
      }

      const body = await res.json().catch(() => {
        throw new Error('嵌入端点返回的不是合法 JSON');
      });
      const data = body?.data;
      if (!Array.isArray(data) || data.length !== texts.length) {
        throw new Error('嵌入端点返回的条数与请求不符');
      }
      return data.map((d) => {
        if (!Array.isArray(d.embedding))
          throw new Error('嵌入端点返回结构异常');
        return new Float32Array(d.embedding);
      });
    },
  };
}

/**
 * 可预测的模拟嵌入：把文本映射成一个固定维度的向量。
 *
 * **不是语义模型** —— 相同输入给相同向量、相似文本给相似向量（按字符重叠），
 * 足以测试存储、维度校验、排序与降级路径，但不能用来验证「语义质量」。
 */
export function createMockEmbedder({ dim = 32 } = {}) {
  const embedOne = (text) => {
    const v = new Float32Array(dim);
    for (let i = 0; i < text.length; i++) {
      v[text.charCodeAt(i) % dim] += 1;
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) v[i] /= norm;
    return v;
  };

  return {
    baseUrl: 'mock://embedder',
    model: 'mock-embed',
    async embed(text) {
      return embedOne(text);
    },
    async embedMany(texts) {
      return texts.map(embedOne);
    },
  };
}
