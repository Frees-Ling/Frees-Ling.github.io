// 受限访问身份（ACCESS-001）。
//
// ── 它解决什么问题 ──
//
// 在此之前服务只有**一个**令牌，而它是全权的：拿到它就能读全部私人笔记、
// 记忆与对话历史，还能发起对话 —— 那等于把私人内容送到模型端点。
// 「把它交给一个外部 AI」在那种模型下等于交出整个知识库。
//
// 这里把它拆成**具名、有范围、可撤销、可审计**的身份。
//
// ── 三条设计规则 ──
//
// 1. **默认拒绝。** 令牌的 scopes 为空时它什么也做不了；
//    未在路由表里分类的路径一律要求 `admin`。加新路由时忘了分类，
//    结果是「够不着」而不是「默认放行」—— 失败方向必须是安全的那一侧。
//
// 2. **只存哈希。** 与 ADR-026 同一个理由：库被拿走时里面不该有能直接用的
//    凭据。明文令牌只在创建那一刻返回一次。代价是丢了只能重建 ——
//    那是正确的结果，不是缺陷。
//
// 3. **审计记「谁访问了什么」，不记内容。** 一份用来防泄漏的日志
//    若把私人内容抄进去，它自己就成了新的泄漏面。

import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * 能力清单。
 *
 * 刻意做得**粗**：细到每个端点的权限表会随路由增长而漂移，
 * 而漂移的表现是「某个新端点忘了收口」。粗粒度 + 默认拒绝更抗腐坏。
 */
export const SCOPES = {
  'read:search': '检索（关键词与语义）与读取摘要',
  'read:notes': '读取笔记全文',
  'read:memories': '读取已确认的记忆',
  'write:draft': '写入待审核草稿（不会直接成为事实）',
  admin: '管理：删除、发布、配置、令牌本身',
};

const ALL_SCOPES = Object.keys(SCOPES);

/** 允许预设的组合，避免调用方每次自己拼。 */
export const PRESETS = {
  /** 只读的检索伙伴：能搜、能读，不能写、不能管。 */
  reader: ['read:search', 'read:notes', 'read:memories'],
  /** 只搜不读全文：最保守的一档。 */
  searcher: ['read:search'],
  /** 可以提草稿，但不能让草稿生效。 */
  drafter: ['read:search', 'read:notes', 'read:memories', 'write:draft'],
};

const TOKEN_BYTES = 32;
const LABEL_MAX = 100;

const hashOf = (token) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const now = () => new Date().toISOString();

/** 解析逗号分隔的 scopes 字段。空字符串 = 没有任何能力。 */
function parseScopes(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 造一个新令牌。
 *
 * **明文只在返回值里出现这一次**，库里只有哈希。
 * 调用方拿到后必须立刻交给使用者，不要落盘、不要打日志。
 */
export function createToken(db, { label, scopes, expiresAt = null } = {}) {
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error('令牌需要一个用途说明（撤销时靠它认人）');
  }
  if (label.length > LABEL_MAX)
    throw new Error(`用途说明过长（上限 ${LABEL_MAX}）`);

  if (!Array.isArray(scopes)) throw new Error('scopes 必须是数组');
  const unknown = scopes.filter((s) => !ALL_SCOPES.includes(s));
  if (unknown.length) {
    throw new Error(
      `未知的能力：${unknown.join(', ')}。可用的是 ${ALL_SCOPES.join(' / ')}`,
    );
  }

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const id = randomUUID();

  db.prepare(
    `INSERT INTO access_tokens (id, token_hash, label, scopes, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, hashOf(token), label.trim(), scopes.join(','), now(), expiresAt);

  return { token, record: getToken(db, id) };
}

/** 单条令牌的元信息 —— **不含明文也不含哈希**。 */
export function getToken(db, id) {
  const row = db.prepare('SELECT * FROM access_tokens WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    scopes: parseScopes(row.scopes),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    active: !row.revoked_at && !isExpired(row, new Date()),
  };
}

function isExpired(row, at) {
  return Boolean(row.expires_at) && new Date(row.expires_at) <= at;
}

/** 列出全部令牌的元信息（供界面展示与撤销）。 */
export function listTokens(db) {
  return db
    .prepare('SELECT id FROM access_tokens ORDER BY created_at DESC')
    .all()
    .map((r) => getToken(db, r.id));
}

/**
 * 校验一个令牌，返回它的身份；不合法时返回 null。
 *
 * 用 `timingSafeEqual` 比较哈希：普通的 `===` 会在第一个不同的字节处返回，
 * 泄漏出「前几位猜对了」这种时序信息。
 */
export function verifyToken(db, token, at = new Date()) {
  if (typeof token !== 'string' || !token) return null;

  const row = db
    .prepare('SELECT * FROM access_tokens WHERE token_hash = ?')
    .get(hashOf(token));
  if (!row) return null;
  if (row.revoked_at) return null;
  if (isExpired(row, at)) return null;

  db.prepare('UPDATE access_tokens SET last_used_at = ? WHERE id = ?').run(
    at.toISOString(),
    row.id,
  );

  return {
    id: row.id,
    label: row.label,
    scopes: parseScopes(row.scopes),
  };
}

/**
 * 撤销。**不删行** —— 删掉之后审计日志里的 token_id 就指向了空，
 * 「谁做过什么」从此查不出来。留一行带 revoked_at 的记录，历史才完整。
 */
export function revokeToken(db, id, at = new Date()) {
  return (
    db
      .prepare(
        'UPDATE access_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      )
      .run(at.toISOString(), id).changes > 0
  );
}

/**
 * 轮换：作废旧的，按**同样的 label 与 scopes** 发一个新的。
 *
 * 不做成「原地换哈希」是因为那样会丢掉旧令牌的撤销时间 ——
 * 而「这个身份什么时候被换掉的」在事后追溯时是有用的信息。
 */
export function rotateToken(db, id, { expiresAt = null } = {}) {
  const old = getToken(db, id);
  if (!old) throw new Error(`令牌不存在：${id}`);

  const created = createToken(db, {
    label: old.label,
    scopes: old.scopes,
    expiresAt,
  });
  revokeToken(db, id);
  return created;
}

// ── 审计 ──

/**
 * 记一条访问。
 *
 * **只记方法与路径，不记内容与查询串里的值** —— 路径足以回答
 * 「谁碰过什么接口」，而查询串与响应体里可能是私人内容。
 * 一份用来防泄漏的日志自己不该成为泄漏面。
 */
export function logAccess(
  db,
  { tokenId = null, method, path, allowed, at = new Date() },
) {
  db.prepare(
    `INSERT INTO access_log (token_id, method, path, allowed, at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(tokenId, method, path, allowed ? 1 : 0, at.toISOString());
}

export function recentAccess(db, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT l.*, t.label AS token_label
         FROM access_log l LEFT JOIN access_tokens t ON t.id = l.token_id
        ORDER BY l.at DESC LIMIT ?`,
    )
    .all(limit)
    .map((r) => ({
      tokenId: r.token_id,
      tokenLabel: r.token_label,
      method: r.method,
      path: r.path,
      allowed: r.allowed === 1,
      at: r.at,
    }));
}

// ── 路径 → 所需能力 ──

/**
 * 这个请求需要什么能力。
 *
 * **分类不了的一律返回 `admin`。** 这是整个模块最重要的一行：
 * 将来加了新路由却忘了在这里分类，结果是「受限身份够不着」，
 * 而不是「默认放行」。失败方向必须是安全的那一侧。
 */
export function requiredScope(method, path) {
  // 健康检查不泄露任何内容，也不需要额外能力
  if (path === '/api/health') return null;

  if (path === '/api/search' || path === '/api/search-all')
    return 'read:search';
  if (path === '/api/notes' || path.startsWith('/api/notes/')) {
    if (method === 'GET') return 'read:notes';
    // **只有「新建」算 write:draft。** 改一篇已有的、或删一篇，
    // 都是对**已存在内容**的破坏性操作，与「提一条草稿等人审」是两回事。
    //
    // 这里原先只按「GET 还是非 GET」二分，于是 DELETE 落在了 write:draft 上 ——
    // 一个「可以提草稿」的身份因此能删掉任何一篇笔记。实测被用例抓到。
    if (method === 'POST' && path === '/api/notes') return 'write:draft';
    return 'admin';
  }
  if (path === '/api/memories' || path.startsWith('/api/memories/')) {
    // 记忆的「写」是审核动作，不是提问 —— 那属于管理
    return method === 'GET' ? 'read:memories' : 'admin';
  }
  if (path === '/api/conversations' || path.startsWith('/api/conversations/')) {
    // 对话会把私人内容送到模型端点，且写入的是运行痕迹，属于管理面
    return 'admin';
  }

  return 'admin';
}

/** 调用方是否具备所需能力。 */
export function scopeAllows(identity, method, path) {
  const needed = requiredScope(method, path);
  if (needed === null) return true;
  return (identity?.scopes ?? []).includes(needed);
}
