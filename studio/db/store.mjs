// 知识库存储层的读写接口。
//
// 设计约束（来自 docs/knowledge-base.md 的三层模型）：
//   · 原始档案只增不改 —— 它是底档，摘要不得替代它
//   · 长期记忆必须经人工审核才能从 pending 升为 approved
//   · AI 起草的内容带 origin='ai_draft' 进入，不自动等同于事实
//
// 所有写操作都在事务里；出错即回滚。

import { createHash, randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();

/** 稳定内容哈希，用于导入去重（同一份文件重复导入必须幂等）。 */
export function contentHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
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
  const existing = db
    .prepare('SELECT id FROM archive_entries WHERE hash = ?')
    .get(hash);
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
