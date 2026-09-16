// 对话路由：把 KB-003 的适配层与对话存储接到 HTTP 上。
//
// ── 引用注入的设计 ──
//
// 用户提问时先在知识库检索，把命中的笔记作为**系统消息**注入。
// 两个刻意的选择：
//
//  ① 引用是**显式列出**的，不是让模型自己去「回忆」——
//     检索用 SQLite FTS5，结果可复现、可追溯、不依赖模型的记性。
//  ② citations 持久化到消息上，而不是每次重新检索 ——
//     笔记会被编辑和删除，事后重算得到的依据与当时看到的不再相同。
//     「当时是基于什么回答的」必须能复原。

import {
  createConversation,
  getConversation,
  addMessage,
  listConversations,
  deleteConversation,
  searchNotes,
  saveAnswerAsDraft,
  proposeMemoryFromMessage,
  linkMemoryToNote,
  unlinkMemoryFromNote,
  getMemoryProvenance,
  searchEverything,
  semanticSearch,
} from '../db/store.mjs';

/** 每次注入的最大引用条数。太多会把上下文挤满，也会稀释重点。 */
const MAX_CITATIONS = 5;

/** 引用片段的最大长度（字）。整篇塞进去既费 token 也无助于回答。 */
const CITATION_CHARS = 600;

export function buildCitationContext(hits) {
  if (hits.length === 0) return null;
  const parts = hits.map((note, i) => {
    const body = (note.body || '').slice(0, CITATION_CHARS);
    return `[${i + 1}] 《${note.title}》\n${body}`;
  });
  return (
    '以下是知识库中与问题相关的引用记录，请优先依据它们回答；' +
    '若它们不足以回答，请明确说明缺少什么，不要编造。\n\n' +
    parts.join('\n\n')
  );
}

/** 包一层：把 send 的调用记为「已处理」，便于主路由判断是否继续。 */
export async function handleChat(req, res, deps, ctx) {
  let handled = false;
  const send = (...args) => {
    handled = true;
    return ctx.send(...args);
  };
  await route(req, res, deps, { ...ctx, send });
  return handled ? true : null;
}

async function route(req, res, deps, { path, method, readBody, send, url }) {
  const { db, provider } = deps;

  // ── 模型端点状态 ──
  //
  // 探活而不是只回配置：用户最需要知道的是「现在能不能用」，
  // 而不是「配置里写的是什么」。不可用时给出可操作的提示。
  if (path === '/api/model' && method === 'GET') {
    if (!provider) {
      return send(res, 200, {
        ok: false,
        model: '',
        hint: '未配置模型端点。',
      });
    }
    try {
      const models = await provider.listModels();
      return send(res, 200, {
        ok: true,
        model: provider.model,
        available: models,
        baseUrl: provider.baseUrl,
      });
    } catch (error) {
      // 只回状态与提示，不回传底层错误详情（可能含主机路径）
      return send(res, 200, {
        ok: false,
        model: provider.model,
        baseUrl: provider.baseUrl,
        hint: '模型端点不可用 —— 请先启动本地推理服务（如 LM Studio）。',
      });
    }
  }

  // ── 对话列表 / 新建 ──
  if (path === '/api/conversations') {
    if (method === 'GET') {
      // 列表刻意**不带** messages：几十条对话各带全部消息会很浪费，
      // 列表只需要标题与时间。需要消息时再按 id 取。
      return send(res, 200, { conversations: listConversations(db) });
    }
    if (method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      const created = createConversation(db, {
        model: body.model || provider?.model || '',
      });
      // 回**完整形状**而不是刚插入的行：新建与读取返回的对象结构必须一致，
      // 否则调用方要为「刚建的」和「读到的」写两套处理。
      // 实测踩过：新建返回的对象没有 messages 字段，前端 push 时直接崩。
      return send(res, 201, { conversation: getConversation(db, created.id) });
    }
  }

  const conv = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (conv) {
    const id = decodeURIComponent(conv[1]);
    if (method === 'GET') {
      const conversation = getConversation(db, id);
      if (!conversation) return send(res, 404, { error: '对话不存在' });
      return send(res, 200, { conversation });
    }
    if (method === 'DELETE') {
      const removed = deleteConversation(db, id);
      if (!removed) return send(res, 404, { error: '对话不存在' });
      return send(res, 200, { removed: true });
    }
  }

  // ── 发送消息：检索 → 注入引用 → 调用模型 → 双写入库 ──
  const sendMsg = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (sendMsg && method === 'POST') {
    const id = decodeURIComponent(sendMsg[1]);
    const conversation = getConversation(db, id);
    if (!conversation) return send(res, 404, { error: '对话不存在' });

    const body = await readBody(req);
    const content = String(body.content || '').trim();
    if (!content) return send(res, 400, { error: '消息内容不能为空' });

    if (!provider) {
      return send(res, 503, {
        error:
          '没有可用的模型端点。请先启动本地推理服务（如 LM Studio），' +
          '或在配置里指定一个 OpenAI 兼容端点。',
      });
    }

    addMessage(db, id, { role: 'user', content });

    // 检索 → 引用。检索失败不应让整轮对话失败，降级为无引用继续。
    let hits = [];
    try {
      hits = searchNotes(db, content, { limit: MAX_CITATIONS });
    } catch {
      hits = [];
    }
    const citations = hits.map((n) => n.id);

    const history = getConversation(db, id).messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const context = buildCitationContext(hits);
    const payload = context
      ? [{ role: 'system', content: context }, ...history]
      : history;

    let answer;
    try {
      answer = await provider.chat(payload);
    } catch (error) {
      // 模型失败时**保留**用户消息（已经写了），把错误作为可读信息返回。
      // 不把错误塞进 assistant 消息 —— 那会污染历史，让下次请求带上它。
      return send(res, 502, {
        error: error.message,
        saved: { role: 'user', content },
      });
    }

    const assistant = addMessage(db, id, {
      role: 'assistant',
      content: answer.content,
      citations,
    });

    return send(res, 201, {
      message: { ...assistant, citations },
      citations: hits.map((n) => ({ id: n.id, title: n.title })),
    });
  }

  // ── 从某条回答提取待审核记忆 ──
  const extract = path.match(/^\/api\/conversations\/([^/]+)\/memories$/);
  if (extract && method === 'POST') {
    const id = decodeURIComponent(extract[1]);
    const body = await readBody(req);
    const messageId = String(body.messageId || '');

    // URL 里的对话 id 必须与消息实际所属的对话一致。
    //
    // 这不是权限检查（本服务是单用户本地服务，没有第二个主体可供越权，
    // 见 docs/knowledge-base.md 与 ADR-002），而是**语义正确性**：
    // 路径声明「从这段对话提取记忆」，那么来源就必须真在这段对话里。
    // 不校验的话，来源链会记下一个与服务端事实不符的出处 ——
    // 而来源错了比没有来源更糟，追溯功能正建立在它可信的前提上。
    const message = db
      .prepare('SELECT conversation_id, role FROM messages WHERE id = ?')
      .get(messageId);
    if (!message || message.conversation_id !== id) {
      return send(res, 404, { error: '消息不存在于该对话中' });
    }

    const memory = proposeMemoryFromMessage(db, {
      messageId,
      content: body.content,
      confidence: Number(body.confidence ?? 0.5),
    });
    return send(res, 201, { memory });
  }

  // ── 统一检索：语义优先，端点不可用时降级为关键词 ──
  if (path === '/api/search-all' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    return send(res, 200, {
      query: q,
      ...(await searchWithFallback(db, q, deps)),
    });
  }

  // ── 记忆的来源链 ──
  const prov = path.match(/^\/api\/memories\/([^/]+)\/provenance$/);
  if (prov && method === 'GET') {
    const result = getMemoryProvenance(db, decodeURIComponent(prov[1]));
    if (!result) return send(res, 404, { error: '记忆不存在' });
    return send(res, 200, result);
  }

  // ── 记忆 ↔ 知识库条目的关联 ──
  const memNotes = path.match(/^\/api\/memories\/([^/]+)\/notes$/);
  if (memNotes) {
    const memoryId = decodeURIComponent(memNotes[1]);
    if (method === 'POST') {
      const body = await readBody(req);
      return send(
        res,
        201,
        linkMemoryToNote(db, memoryId, String(body.noteId || '')),
      );
    }
    if (method === 'DELETE') {
      const noteId = url.searchParams.get('noteId') || '';
      const removed = unlinkMemoryFromNote(db, memoryId, noteId);
      if (!removed) return send(res, 404, { error: '关联不存在' });
      return send(res, 200, { removed: true });
    }
  }

  // ── 把某条回答存为草稿 ──
  const draft = path.match(/^\/api\/conversations\/([^/]+)\/draft$/);
  if (draft && method === 'POST') {
    const id = decodeURIComponent(draft[1]);
    const body = await readBody(req);
    const note = saveAnswerAsDraft(db, {
      conversationId: id,
      messageId: String(body.messageId || ''),
      title: body.title,
    });
    return send(res, 201, { note });
  }

  return null; // 未命中，交回主路由
}

/**
 * 语义检索 + 降级（KB-007）。
 *
 * 检索是基础功能。嵌入端点没启动时**退回关键词检索**，而不是让整个检索不可用 ——
 * 「因为没开 LM Studio 所以什么也搜不到」是不可接受的。
 *
 * 返回值里**必须带上实际用了哪种模式**：让调用方（和界面）能看出
 * 「这次结果为什么不太对」，而不是让人以为语义检索生效了却得到空结果。
 */
export async function searchWithFallback(db, query, deps, { limit = 10 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return { mode: 'empty', notes: [], memories: [] };

  const embedder = deps.embedder;
  if (embedder) {
    try {
      const vector = await embedder.embed(q);
      const hits = semanticSearch(db, vector, { limit });
      return {
        mode: 'semantic',
        model: embedder.model,
        notes: hits.filter((h) => h.kind === 'note'),
        memories: hits.filter((h) => h.kind === 'memory'),
      };
    } catch {
      // 落到关键词路径。**不把错误抛出去**，也不伪装成语义结果。
    }
  }

  const fallback = searchEverything(db, q, { limit });
  return {
    mode: 'keyword',
    reason: embedder ? '嵌入端点不可用，已退回关键词检索' : '未配置嵌入端点',
    ...fallback,
  };
}
