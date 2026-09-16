// 知识库服务的路由层。
//
// 设计约束：
//   · 每个请求都要过鉴权，**没有例外**（连 /health 也要）——
//     「健康检查不需要认证」是很常见的疏漏，而它同样泄露服务的存在与版本
//   · 私人内容默认不可公开：本层**不存在**任何「发布到公网」的路由，
//     也没有能改变这个事实的参数
//   · 错误响应不回显堆栈或内部路径

import { join } from 'node:path';
import { tokenMatches } from './index.mjs';
import { handleChat } from './chat.mjs';
import {
  hasSession,
  serveFile,
  resolveStatic,
  LOGIN_PAGE,
  WEB_ROOT,
  TOKENS_FILE,
} from './web.mjs';

const COOKIE = 'frees_studio';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function send(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

/** 读取请求体，带大小上限 —— 防止一个超大 body 把进程撑爆。 */
async function readBody(req, limit = 1024 * 1024) {
  // 复用 readRawBody，避免两套读取实现各自漂移出不同的上限行为
  const raw = await readRawBody(req, limit);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

/** 读原始请求体字符串（表单与 JSON 都要用）。 */
async function readRawBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      // 光 throw 是不够的。
      //
      // 抛出后本函数不再读取请求体，但**客户端仍在往里写** ——
      // socket 的接收缓冲满了以后，对端会一直阻塞等待，直到它自己超时。
      // 实测：一个 2MB 的请求要 6 秒才失败，看起来像服务卡住。
      //
      // 直接销毁连接，接受「客户端看到的是连接错误而不是 413」这个代价。
      //
      // 试过「先回 413 再断连」，实测无效：fetch 这类客户端在写完整个请求体
      // 之前不会去读响应，状态码卡在 socket 缓冲里送不到它手上，
      // 于是仍然要等 6 秒。而直接断连是 5 毫秒。
      //
      // 权衡：一个「慢但状态码清晰」的失败，不如一个「快但没有状态码」的失败 ——
      // 尤其在本地工具里，卡住 6 秒看起来像服务死了，而连接被重置能立刻看出是请求太大。
      req.destroy();
      throw new Error('请求体过大');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function bearer(req) {
  const raw = req.headers.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

export async function handleRequest(req, res, deps) {
  const { db, token, store } = deps;
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  const method = req.method || 'GET';

  // ── 以下三条在鉴权之前 ──
  //
  // 它们必须免鉴权，否则浏览器永远拿不到令牌（鸡生蛋问题）。
  // 安全性由另外两道保证：服务只绑 127.0.0.1，且 remoteAddress 必须本机。
  // 这三条都不触碰任何笔记数据。

  // 静态资源（界面本身不含私人数据）
  if (path.startsWith('/static/')) {
    const file = resolveStatic(WEB_ROOT, path.slice('/static'.length));
    if (!file) return send(res, 404, { error: '没有这个资源' });
    serveFile(res, file);
    return;
  }

  // 设计变量直接取自项目的 tokens.css —— 单一真相源，界面与公开站不会漂移
  if (path === '/tokens.css' && method === 'GET') {
    serveFile(res, TOKENS_FILE);
    return;
  }

  // 图标：浏览器每次加载都会自动请求它，而它不含任何私人信息。
  // 不处理的话会走鉴权分支返回 401，在每次页面加载的控制台留下一条噪音 ——
  // 噪音会训练人忽略控制台，那比缺一个图标糟糕得多。
  if (path === '/favicon.ico' && method === 'GET') {
    res.writeHead(204, { 'cache-control': 'max-age=86400' });
    res.end();
    return;
  }

  // 建立会话：校验令牌后下发 HttpOnly Cookie
  if (path === '/api/session' && method === 'POST') {
    // 登录页是原生表单，提交的是 application/x-www-form-urlencoded，
    // **不是** JSON。这里曾经只按 JSON 解析，于是 token 永远是空字符串、
    // 登录必然失败 —— 单测传 JSON 所以没发现，是浏览器验证抓出来的。
    const raw = await readRawBody(req).catch(() => '');
    const isForm = (req.headers['content-type'] || '').includes(
      'form-urlencoded',
    );
    const provided = String(
      isForm
        ? new URLSearchParams(raw).get('token') || ''
        : (JSON.parse(raw || '{}').token ?? ''),
    );
    if (!tokenMatches(token, provided)) {
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      res.end(LOGIN_PAGE.replace('%ERROR%', '令牌不对，请重新复制'));
      return;
    }
    res.writeHead(303, {
      location: '/',
      'set-cookie': `${COOKIE}=${encodeURIComponent(provided)}; HttpOnly; SameSite=Strict; Path=/`,
    });
    res.end();
    return;
  }

  // 入口页：无会话给登录页，有会话给界面
  if (path === '/' && method === 'GET') {
    if (!hasSession(req, token)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(LOGIN_PAGE.replace('%ERROR%', ''));
      return;
    }
    const file = resolveStatic(WEB_ROOT, 'index.html');
    if (!file) return send(res, 500, { error: '界面文件缺失' });
    serveFile(res, file);
    return;
  }

  // ── 鉴权：其余所有路由，无例外 ──
  // 接受 Bearer 头（命令行/测试）或会话 Cookie（浏览器）
  if (!tokenMatches(token, bearer(req)) && !hasSession(req, token)) {
    send(res, 401, { error: '需要有效的访问令牌' });
    return;
  }

  try {
    // ── 对话相关（KB-004）── 未命中时返回 null，继续走下面的路由
    const chatHandled = await handleChat(req, res, deps, {
      path,
      method,
      url,
      readBody,
      send,
    });
    if (chatHandled !== null) return;

    // ── 健康检查 ──
    if (path === '/api/health' && method === 'GET') {
      send(res, 200, { ok: true });
      return;
    }

    // ── 笔记列表 ──
    if (path === '/api/notes' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') || 50);
      const offset = Number(url.searchParams.get('offset') || 0);
      const status = url.searchParams.get('status') || undefined;
      send(res, 200, { notes: store.listNotes(db, { limit, offset, status }) });
      return;
    }

    // ── 新建笔记 ──
    if (path === '/api/notes' && method === 'POST') {
      const body = await readBody(req);
      const note = store.createNote(db, {
        title: body.title,
        body: body.body ?? '',
        kind: body.kind ?? 'note',
        // 刻意不接受调用方指定 origin：外部不能自称「人工写的」，
        // 只有服务内部（将来接 AI 时）才写 ai_draft
        tags: Array.isArray(body.tags) ? body.tags : [],
      });
      send(res, 201, { note });
      return;
    }

    // ── 单条笔记 ──
    const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch) {
      const id = decodeURIComponent(noteMatch[1]);

      if (method === 'GET') {
        const note = store.getNote(db, id);
        if (!note) return send(res, 404, { error: '笔记不存在' });
        send(res, 200, { note });
        return;
      }

      if (method === 'PATCH') {
        const body = await readBody(req);
        const note = store.updateNote(db, id, {
          title: body.title,
          body: body.body,
          status: body.status,
        });
        if (Array.isArray(body.tags)) store.setNoteTags(db, id, body.tags);
        send(res, 200, { note: store.getNote(db, note.id) });
        return;
      }

      if (method === 'DELETE') {
        const removed = store.deleteNote(db, id);
        if (!removed) return send(res, 404, { error: '笔记不存在' });
        send(res, 200, { removed: true });
        return;
      }
    }

    // ── 检索 ──
    if (path === '/api/search' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      send(res, 200, { query: q, hits: store.searchNotes(db, q) });
      return;
    }

    // ── 原始档案导入（幂等）──
    if (path === '/api/archive' && method === 'POST') {
      const body = await readBody(req);
      const result = store.importArchiveEntry(db, {
        kind: body.kind,
        source: body.source,
        content: body.content,
      });
      send(res, result.deduped ? 200 : 201, result);
      return;
    }

    // ── 记忆：提出（只能进 pending）与审核 ──
    if (path === '/api/memories' && method === 'GET') {
      const which = url.searchParams.get('status') || 'pending';
      const list =
        which === 'approved'
          ? store.listApprovedMemories(db)
          : store.listPendingMemories(db);
      send(res, 200, { memories: list });
      return;
    }

    if (path === '/api/memories' && method === 'POST') {
      const body = await readBody(req);
      const memory = store.proposeMemory(db, {
        content: body.content,
        sourceEntryId: body.sourceEntryId ?? null,
        confidence: Number(body.confidence ?? 0),
      });
      send(res, 201, { memory });
      return;
    }

    const memoryReview = path.match(/^\/api\/memories\/([^/]+)\/review$/);
    if (memoryReview && method === 'POST') {
      const body = await readBody(req);
      const memory = store.reviewMemory(
        db,
        decodeURIComponent(memoryReview[1]),
        body.decision,
      );
      send(res, 200, { memory });
      return;
    }

    send(res, 404, { error: '没有这个路由' });
  } catch (error) {
    // 已知的校验错误回 400 并把消息透出（它们是人写的、无内部信息）；
    // 其余一律 500 且不泄露细节。
    const message = String(error.message || '');
    const isValidation =
      /不能为空|未知的|必须在|只能是|不存在或已审核|请求体|只有|不存在于/.test(
        message,
      );
    if (isValidation) {
      send(res, 400, { error: message });
    } else {
      send(res, 500, { error: '内部错误', kind: error.name });
    }
  }
}
