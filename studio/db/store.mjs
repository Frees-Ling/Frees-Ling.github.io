// 知识库存储层的读写接口。
//
// 设计约束（来自 docs/knowledge-base.md 的三层模型）：
//   · 原始档案只增不改 —— 它是底档，摘要不得替代它
//   · 长期记忆必须经人工审核才能从 pending 升为 approved
//   · AI 起草的内容带 origin='ai_draft' 进入，不自动等同于事实
//
// 所有写操作都在事务里；出错即回滚。

import { createHash, randomUUID } from 'node:crypto';
import {
  vectorToBlob,
  blobToVector,
  cosineSimilarity,
} from '../ai/embeddings.mjs';

const now = () => new Date().toISOString();

/** 稳定内容哈希，用于导入去重（同一份文件重复导入必须幂等）。 */
/**
 * 档案内容的去重哈希。
 *
 * **先做一次传输层归一化，再算哈希。** 注意存的还是原文 ——
 * 归一化只影响「算不算同一条」，不影响「存了什么」。
 *
 * 归一化的是两类**传输产生的差异**，不是内容差异：
 *   · 行尾 CRLF / LF —— 同一份文件在不同系统间转手就会变
 *   · 结尾的空白与换行 —— 编辑器与导出工具最常见的差异
 *
 * 实测踩过：不归一化时，同一份文档重导一次会多出一条「新版本」，
 * 而 `findConflicts` 会把它报成一次冲突。**误报的冲突比不报更糟** ——
 * 它让人去查一个根本不存在的问题，查几次之后就不再相信这个提示了。
 *
 * 刻意**不**归一化中间的空白与全角半角：那些是内容。
 */
export function contentHash(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// ──────────────────────────────── 笔记 ────────────────────────────────

export function createNote(
  db,
  { title, body = '', kind = 'note', origin = 'human', tags = [] },
) {
  if (!title || !title.trim()) throw new Error('标题不能为空');
  if (!['note', 'article'].includes(kind))
    throw new Error(`未知的 kind: ${kind}`);
  if (!['human', 'ai_draft'].includes(origin))
    throw new Error(`未知的 origin: ${origin}`);

  const id = randomUUID();
  const ts = now();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO notes (id, title, body, kind, status, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(id, title.trim(), body, kind, origin, ts, ts);

    attachTags(db, id, tags);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getNote(db, id);
}

export function getNote(db, id) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return null;
  return {
    ...note,
    tags: db
      .prepare(
        `SELECT t.name FROM tags t
         JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ? ORDER BY t.name`,
      )
      .all(id)
      .map((r) => r.name),
  };
}

export function updateNote(db, id, { title, body, status } = {}) {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!existing) throw new Error(`笔记不存在: ${id}`);

  if (status && !['draft', 'ready', 'published'].includes(status)) {
    throw new Error(`未知的 status: ${status}`);
  }
  // 人工确认：AI 起草的内容一旦被编辑，即视为已由人接手
  const origin = existing.origin === 'ai_draft' ? 'human' : existing.origin;

  db.prepare(
    `UPDATE notes
        SET title = ?, body = ?, status = ?, origin = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    title ?? existing.title,
    body ?? existing.body,
    status ?? existing.status,
    origin,
    now(),
    id,
  );

  return getNote(db, id);
}

export function deleteNote(db, id) {
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return result.changes > 0;
}

export function listNotes(db, { limit = 50, offset = 0, status } = {}) {
  const rows = status
    ? db
        .prepare(
          'SELECT * FROM notes WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
        )
        .all(status, limit, offset)
    : db
        .prepare(
          'SELECT * FROM notes ORDER BY updated_at DESC LIMIT ? OFFSET ?',
        )
        .all(limit, offset);
  return rows;
}

// ──────────────────────────────── 标签 ────────────────────────────────

function attachTags(db, noteId, tags) {
  for (const raw of tags) {
    const name = String(raw).trim();
    if (!name) continue;
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
    const { id: tagId } = db
      .prepare('SELECT id FROM tags WHERE name = ?')
      .get(name);
    db.prepare(
      'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
    ).run(noteId, tagId);
  }
}

export function setNoteTags(db, noteId, tags) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
    attachTags(db, noteId, tags);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ──────────────────────────── 全文检索 ────────────────────────────

/**
 * 检索笔记。空查询返回空数组 —— 不做「返回全部」的兜底，
 * 那会让调用方把「没搜到」误当成「有很多结果」。
 */
export function searchNotes(db, query, { limit = 20 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];

  // trigram 分词器要求查询串至少 3 个字符，否则不返回结果。
  // 与其静默返回空，不如退回 LIKE —— 短查询大多是在找标题里的词。
  if (q.length < 3) {
    return db
      .prepare(
        `SELECT * FROM notes
          WHERE title LIKE ? OR body LIKE ?
          ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(`%${q}%`, `%${q}%`, limit);
  }

  return db
    .prepare(
      `SELECT n.* FROM notes_fts f
        JOIN notes n ON n.rowid = f.rowid
       WHERE notes_fts MATCH ?
       ORDER BY rank LIMIT ?`,
    )
    .all(q, limit);
}

// ──────────────────────────── 原始档案 ────────────────────────────

/**
 * 导入一条档案。**幂等**：同一内容重复导入不会产生第二条。
 * @returns {{ id: string, deduped: boolean }}
 */
export function importArchiveEntry(db, { kind, source, content }) {
  if (!['conversation', 'document', 'edit'].includes(kind)) {
    throw new Error(`未知的 kind: ${kind}`);
  }
  const hash = contentHash(content);
  // 判据是 **(来源, 内容)** 而不是只看内容 —— 见迁移 v9 的说明：
  // 同一段文字来自两份不同文档时必须各留一条，否则来源与时间会无声消失。
  const existing = db
    .prepare('SELECT id FROM archive_entries WHERE source = ? AND hash = ?')
    .get(source, hash);
  if (existing) return { id: existing.id, deduped: true };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO archive_entries (id, kind, source, content, created_at, hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, kind, source, content, now(), hash);

  return { id, deduped: false };
}

// ──────────────────────────── 长期记忆 ────────────────────────────

/**
 * 写入一条**待审核**的记忆。
 *
 * 刻意不提供「直接写入已确认记忆」的接口 ——
 * AI 提取的内容必须经过 reviewMemory 才能变成 approved，
 * 让「AI 自动总结不得当作已验证事实」成为数据层的强制，而不是约定。
 */
export function proposeMemory(
  db,
  { content, sourceEntryId = null, confidence = 0 },
) {
  if (!content || !content.trim()) throw new Error('记忆内容不能为空');
  if (confidence < 0 || confidence > 1)
    throw new Error('confidence 必须在 0–1 之间');

  const id = randomUUID();
  db.prepare(
    `INSERT INTO memories (id, content, source_entry_id, confidence, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).run(id, content.trim(), sourceEntryId, confidence, now());

  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
}

export function reviewMemory(db, id, decision) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error(`审核结果只能是 approved 或 rejected，收到: ${decision}`);
  }
  const result = db
    .prepare(
      `UPDATE memories SET status = ?, reviewed_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
    .run(decision, now(), id);

  if (result.changes === 0) {
    throw new Error(`记忆不存在或已审核过: ${id}`);
  }
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
}

/** 只有已确认的记忆才对检索可见。 */
export function listApprovedMemories(db, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT * FROM memories WHERE status = 'approved'
        ORDER BY reviewed_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function listPendingMemories(db, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT * FROM memories WHERE status = 'pending'
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit);
}

// ──────────────────────────── 对话 ────────────────────────────

export function createConversation(db, { title = '', model = '' } = {}) {
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO conversations (id, title, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, title, model, ts, ts);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function listConversations(db, { limit = 50 } = {}) {
  return db
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?')
    .all(limit);
}

export function getConversation(db, id) {
  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id);
  if (!conversation) return null;
  const messages = db
    .prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid',
    )
    .all(id)
    .map((m) => ({ ...m, citations: JSON.parse(m.citations) }));
  return { ...conversation, messages };
}

export function addMessage(
  db,
  conversationId,
  { role, content, citations = [] },
) {
  if (!['system', 'user', 'assistant'].includes(role)) {
    throw new Error(`未知的 role: ${role}`);
  }
  const exists = db
    .prepare('SELECT 1 AS ok FROM conversations WHERE id = ?')
    .get(conversationId);
  if (!exists) throw new Error(`对话不存在: ${conversationId}`);

  const id = randomUUID();
  const ts = now();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, citations, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, conversationId, role, content, JSON.stringify(citations), ts);
    // 首条用户消息用作标题，省得每条对话都叫「未命名」
    db.prepare(
      `UPDATE conversations
          SET updated_at = ?,
              title = CASE WHEN title = '' AND ? = 'user' THEN ? ELSE title END
        WHERE id = ?`,
    ).run(ts, role, content.slice(0, 40), conversationId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

export function deleteConversation(db, id) {
  return (
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0
  );
}

/**
 * 把一条 AI 回答存成知识库**草稿**。
 *
 * 关键约束：一律以 origin='ai_draft' 落库。**不提供把回答直接存成
 * 已确认内容的接口** —— 「AI 生成的推测不得自动成为事实」在数据层的落点。
 * 用户后续在编辑器里改动它，updateNote 才会把它转为 human。
 */
export function saveAnswerAsDraft(db, { conversationId, messageId, title }) {
  const message = db
    .prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?')
    .get(messageId, conversationId);
  if (!message) throw new Error('消息不存在');
  if (message.role !== 'assistant')
    throw new Error('只有 AI 的回答可以存为草稿');

  const citations = JSON.parse(message.citations);
  const body = citations.length
    ? `${message.content}\n\n---\n\n引用自：\n${citations.map((c) => `- ${c}`).join('\n')}`
    : message.content;

  return createNote(db, {
    title: title || message.content.slice(0, 40) || '未命名草稿',
    body,
    kind: 'note',
    origin: 'ai_draft',
  });
}

// ──────────────── 三层关联（KB-005）────────────────

/**
 * 从一条对话回答提取待审核记忆。
 *
 * 刻意只写 pending：AI 从对话里提炼的结论**不是**用户确认的事实。
 * 与 proposeMemory 的区别只在于自动带上来源消息，因此可追溯
 * 「这条记忆是从哪次对话的哪句回答来的」。
 */
export function proposeMemoryFromMessage(
  db,
  { messageId, content, confidence = 0.5 },
) {
  const message = db
    .prepare('SELECT * FROM messages WHERE id = ?')
    .get(messageId);
  if (!message) throw new Error('消息不存在');
  if (message.role !== 'assistant') {
    throw new Error('只有 AI 的回答可以提取为记忆');
  }
  const memory = proposeMemory(db, {
    content: content || message.content,
    confidence,
  });
  db.prepare('UPDATE memories SET source_message_id = ? WHERE id = ?').run(
    messageId,
    memory.id,
  );
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(memory.id);
}

/** 关联记忆与知识库条目。可重复调用而不产生重复行。 */
export function linkMemoryToNote(db, memoryId, noteId) {
  const memory = db
    .prepare('SELECT 1 AS ok FROM memories WHERE id = ?')
    .get(memoryId);
  if (!memory) throw new Error(`记忆不存在: ${memoryId}`);
  const note = db.prepare('SELECT 1 AS ok FROM notes WHERE id = ?').get(noteId);
  if (!note) throw new Error(`笔记不存在: ${noteId}`);

  db.prepare(
    `INSERT OR IGNORE INTO memory_notes (memory_id, note_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(memoryId, noteId, now());
  return { memoryId, noteId };
}

export function unlinkMemoryFromNote(db, memoryId, noteId) {
  return (
    db
      .prepare('DELETE FROM memory_notes WHERE memory_id = ? AND note_id = ?')
      .run(memoryId, noteId).changes > 0
  );
}

/**
 * 一条记忆的完整来源链。
 *
 * 三层各自的 id 分散在四张表里，调用方要追溯「这条结论从哪来」
 * 不该自己去拼 SQL —— 拼错一次就会得到一条看似合理实则错误的来源。
 */
export function getMemoryProvenance(db, memoryId) {
  const memory = db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .get(memoryId);
  if (!memory) return null;

  const archive = memory.source_entry_id
    ? db
        .prepare(
          'SELECT id, kind, source, created_at FROM archive_entries WHERE id = ?',
        )
        .get(memory.source_entry_id)
    : null;

  const message = memory.source_message_id
    ? db
        .prepare(
          `SELECT m.id, m.conversation_id, m.created_at, c.title AS conversation_title
             FROM messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE m.id = ?`,
        )
        .get(memory.source_message_id)
    : null;

  const notes = db
    .prepare(
      `SELECT n.id, n.title FROM memory_notes mn
         JOIN notes n ON n.id = mn.note_id
        WHERE mn.memory_id = ? ORDER BY n.updated_at DESC`,
    )
    .all(memoryId);

  return { memory, archive, message, notes };
}

export function listNotesForMemory(db, memoryId) {
  return db
    .prepare(
      `SELECT n.* FROM memory_notes mn JOIN notes n ON n.id = mn.note_id
        WHERE mn.memory_id = ? ORDER BY n.updated_at DESC`,
    )
    .all(memoryId);
}

/**
 * 统一检索：一次查询同时拿到笔记与**已确认**记忆。
 *
 * 待审核记忆刻意**不进入**结果 —— 检索是给人用的，
 * 把未经确认的 AI 推测混进「我的知识」里，等于让推测冒充事实。
 * 它们要经过 reviewMemory 才会出现在这里。
 */
export function searchEverything(db, query, { limit = 10 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return { notes: [], memories: [] };

  const notes = searchNotes(db, q, { limit });

  const memories = db
    .prepare(
      `SELECT * FROM memories
        WHERE status = 'approved' AND content LIKE ?
        ORDER BY reviewed_at DESC LIMIT ?`,
    )
    .all(`%${q}%`, limit);

  return { notes, memories };
}

// ──────────────── 语义检索（KB-007）────────────────

export function upsertEmbedding(db, { ownerKind, ownerId, model, vector }) {
  if (!['note', 'memory'].includes(ownerKind)) {
    throw new Error(`未知的 ownerKind: ${ownerKind}`);
  }
  if (!vector || vector.length === 0) throw new Error('向量不能为空');

  db.prepare(
    `INSERT INTO embeddings (owner_kind, owner_id, model, dim, vector, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_kind, owner_id) DO UPDATE SET
       model = excluded.model, dim = excluded.dim,
       vector = excluded.vector, created_at = excluded.created_at`,
  ).run(ownerKind, ownerId, model, vector.length, vectorToBlob(vector), now());
}

export function getEmbedding(db, ownerKind, ownerId) {
  const row = db
    .prepare('SELECT * FROM embeddings WHERE owner_kind = ? AND owner_id = ?')
    .get(ownerKind, ownerId);
  return row ? { ...row, vector: blobToVector(row.vector) } : null;
}

/**
 * 语义检索：把所有向量取出来在 JS 里算余弦相似度。
 *
 * 个人知识库规模下这是毫秒级；换成向量数据库要为几千条数据引入一个服务，
 * 不划算。规模真的大了再换。
 *
 * 待审核记忆**仍然被排除** —— 语义检索不改变「AI 推测不得冒充事实」这条约束。
 */
export function semanticSearch(
  db,
  queryVector,
  { limit = 10, minScore = 0.1 } = {},
) {
  const rows = db
    .prepare(
      `SELECT e.owner_kind, e.owner_id, e.vector, e.dim
         FROM embeddings e
         LEFT JOIN notes n   ON e.owner_kind = 'note'   AND n.id = e.owner_id
         LEFT JOIN memories m ON e.owner_kind = 'memory' AND m.id = e.owner_id
        WHERE (e.owner_kind = 'note'   AND n.id IS NOT NULL)
           OR (e.owner_kind = 'memory' AND m.id IS NOT NULL AND m.status = 'approved')`,
    )
    .all();

  const scored = [];
  for (const row of rows) {
    const vec = blobToVector(row.vector);
    let score;
    try {
      score = cosineSimilarity(queryVector, vec);
    } catch {
      continue; // 维度不一致（换过模型）—— 跳过而不是让整个检索失败
    }
    if (score < minScore) continue;
    scored.push({ kind: row.owner_kind, id: row.owner_id, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const hits = scored.slice(0, limit).map((s) => {
    const row =
      s.kind === 'note'
        ? db.prepare('SELECT * FROM notes WHERE id = ?').get(s.id)
        : db.prepare('SELECT * FROM memories WHERE id = ?').get(s.id);
    return { ...row, kind: s.kind, score: Number(s.score.toFixed(4)) };
  });
  return hits;
}
