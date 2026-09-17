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
import { hostAllowed, createLoginThrottle } from './guard.mjs';
import { handleChat } from './chat.mjs';
import { listSettings, setSetting } from '../db/settings.mjs';
import { renderDocument } from '../../src/utils/blocks.mjs';
import { getSession, saveSession, clearSession } from '../db/session.mjs';
import {
  verifyToken,
  scopeAllows,
  requiredScope,
  logAccess,
} from '../access/tokens.mjs';
import {
  hasSession,
  serveFile,
  resolveStatic,
  LOGIN_PAGE,
  WEB_ROOT,
  TOKENS_FILE,
  PROSE_FILE,
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

  // 正文样式同样取自项目，**不复制一份** —— 预览与公开站必须长得一样
  if (path === '/prose.css' && method === 'GET') {
    serveFile(res, PROSE_FILE);
    return;
  }

  // ── 预览渲染（EDITOR-001）──
  //
  // 用的是公开站**同一个**渲染管线（src/utils/markdown-pipeline.mjs）。
  // 这不是「尽量复用」而是唯一路径：`npm run check:preview` 会逐字比对
  // 这条路径的产出与公开站产物，任何分叉都会被那道闸门挡住。
  if (path === '/api/preview' && method === 'POST') {
    const body = await readBody(req);
    if (typeof body.markdown !== 'string') {
      send(res, 400, { error: '需要 { markdown }' });
      return;
    }
    try {
      // renderDocument 一次渲染同时给出 HTML 与块 ——
      // 分别调 renderMarkdown 和 collectBlocks 会渲染两遍，
      // 长文档上每敲一次键都能感觉到
      const { code, blocks, headings } = await renderDocument(body.markdown);
      send(res, 200, { html: code, blocks, headings });
    } catch (error) {
      // 渲染失败（例如 KaTeX 语法错）不该是 500 —— 那是用户正在编辑的
      // 内容有问题，提示要能贴到编辑器旁边，而不是「内部错误」
      send(res, 400, { error: `渲染失败：${error.message}` });
    }
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

  // ── Host 校验（SEC-002）──
  //
  // 挡 DNS rebinding：外站把域名解析到 127.0.0.1 之后，浏览器会认为
  // 「外站与本地服务同源」，于是请求照样打到这儿，而 remoteAddress
  // 确实是 127.0.0.1。区别只在 Host 头 —— 它写的是外站域名。
  //
  // 这里返回 403 而不是 401：这是**地址不对**，不是凭据不对，
  // 提示语要能让人分辨，否则会去反复检查令牌。
  // 端口取自连接本身（req.socket.localPort），而不是 createServer 时的参数 ——
  // 那时端口还没绑定（测试里用 0 让系统分配），拿不到真实值。
  if (!hostAllowed(req.headers.host, req.socket.localPort)) {
    send(res, 403, { error: '只接受本机回环地址访问' });
    return;
  }

  // 建立会话：校验令牌后下发 HttpOnly Cookie
  if (path === '/api/session' && method === 'POST') {
    const who = req.socket.remoteAddress || 'unknown';
    if (!deps.loginThrottle.check(who)) {
      const wait = deps.loginThrottle.retryAfter(who);
      res.writeHead(429, {
        'content-type': 'text/html; charset=utf-8',
        'retry-after': String(wait),
      });
      res.end(
        LOGIN_PAGE.replace('%ERROR%', `尝试过于频繁，请 ${wait} 秒后再试`),
      );
      return;
    }
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
      deps.loginThrottle.recordFailure(req.socket.remoteAddress || 'unknown');
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      res.end(LOGIN_PAGE.replace('%ERROR%', '令牌不对，请重新复制'));
      return;
    }
    deps.loginThrottle.recordSuccess(req.socket.remoteAddress || 'unknown');
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
  //
  // 两条路：
  //   · 主令牌（Bearer 或会话 Cookie）→ **全权**，就是用户自己
  //   · 受限令牌（Bearer）→ 只有它被授予的那几项能力，见 access/tokens.mjs
  //
  // 主令牌走完整鉴权，受限令牌走范围检查。两者是**不同类型的主体**，
  // 而不是「同一个令牌的不同权限」—— 后者会让「这是谁在做」变得含糊，
  // 而审计日志首先要回答的就是那个问题。
  const ownerRequest =
    tokenMatches(token, bearer(req)) || hasSession(req, token);

  let identity = null;
  if (ownerRequest) {
    identity = { owner: true, scopes: [] };
  } else {
    identity = verifyToken(db, bearer(req));
    if (!identity) {
      send(res, 401, { error: '需要有效的访问令牌' });
      return;
    }
    // 受限身份：按路径所需能力判定。
    // **拒绝也记审计** —— 「有人试过但没成功」是最该被看见的一类记录。
    if (!scopeAllows(identity, method, path)) {
      logAccess(db, {
        tokenId: identity.id,
        method,
        path,
        allowed: false,
      });
      send(res, 403, {
        error: `这个身份没有「${requiredScope(method, path)}」能力：${identity.label}`,
      });
      return;
    }
    logAccess(db, { tokenId: identity.id, method, path, allowed: true });
  }
  // identity 是**本请求的局部变量**，不写回 deps。
  //
  // deps 是 createServer 建好、所有请求共用同一个对象；把身份挂上去，
  // 并发请求会在 await 处互相覆盖 —— 一个请求的身份变成另一个的。
  // 这类错误不会报错，只会让权限判定间歇性地判错人。

  try {
    // ── 对话相关（KB-004）── 未命中时返回 null，继续走下面的路由
    const chatHandled = await handleChat(req, res, deps, {
      path,
      method,
      url,
      readBody,
      send,
      // 身份随请求对象传下去，而不是挂在共享的 deps 上
      identity,
    });
    if (chatHandled !== null) return;

    // ── 健康检查 ──
    if (path === '/api/health' && method === 'GET') {
      send(res, 200, { ok: true });
      return;
    }

    // ── 编辑会话（EDITOR-001）──
    //
    // 重启后回到原来那一段。存服务端而不是浏览器：需求的字面意思就是
    // 「重启后还在」，而浏览器存储扛不住换浏览器、清缓存与隐私窗口。
    if (path === '/api/editor-session' && method === 'GET') {
      send(res, 200, { session: getSession(db) });
      return;
    }

    if (path === '/api/editor-session' && method === 'PUT') {
      const body = await readBody(req);
      try {
        send(res, 200, { session: saveSession(db, body) });
      } catch (error) {
        send(res, 400, { error: error.message });
      }
      return;
    }

    if (path === '/api/editor-session' && method === 'DELETE') {
      send(res, 200, { cleared: clearSession(db) });
      return;
    }

    // ── 配置（STUDIO-003）──
    //
    // 列表走 listSettings：敏感项在里面**只有引用，没有值**。
    // 这是值不外流的唯一出口，所以不要图省事在这里「顺便」把值带上。
    if (path === '/api/settings' && method === 'GET') {
      send(res, 200, { settings: await listSettings(db) });
      return;
    }

    if (path === '/api/settings' && method === 'PUT') {
      const body = await readBody(req);
      if (!body || typeof body.key !== 'string') {
        send(res, 400, { error: '需要 { key, value }' });
        return;
      }
      try {
        setSetting(db, body.key, body.value);
      } catch (error) {
        // 校验错误是用户可读的，原样返回；这里的消息都是我们写的，
        // 且刻意不回显输入值 —— 敏感项被拒时若把原文带回去，
        // 就等于把密码写进了响应体和它经过的每一层日志
        send(res, 400, { error: error.message });
        return;
      }
      // 回读取整份配置，让界面拿到权威状态，而不是自己猜
      send(res, 200, { settings: await listSettings(db) });
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
        // 刻意不接受调用方指定 origin：外部不能自称「人工写的」。
        //
        // 主令牌 = 用户自己在操作，记为 human；
        // 受限身份 = 别人（例如外部 AI）写的，**一律记为 ai_draft**，
        // 因此它会带着「AI 起草、未经确认」的身份进入，而不是混进正式内容。
        // 这就是「写入只进待审核草稿」的落点：不是拒绝它写，
        // 而是让它写的东西必须经过人的确认才生效。
        origin: identity.owner ? 'human' : 'ai_draft',
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
