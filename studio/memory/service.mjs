// 长期记忆服务（MEM-001）。
//
// ── 这一层存在的理由 ──
//
// 需求是「记忆不得依赖任何单一引擎的私有格式，即使该引擎停止维护，
// 也必须能导出、换引擎、重建索引」。ADR-023 已经决定自建、不引入
// Mem0 / Letta / OpenMemory，因此这里的「可替换」不是指换第三方引擎，
// 而是指**这一层与存储、与检索方式、与提取方式都解耦**：
//
//   · 存储      —— 全部经 SQLite 的表，导出即 JSON（KB-008 已具备）
//   · 检索      —— 关键词与向量是两种实现，规则由 retrievable() 统一给出
//   · 提取      —— add() 只接受「提议」，是否生效由人决定
//
// ── 三条不可让步的规则 ──
//
// 1. **AI 提取的内容一律 pending。** add() 没有「直接写 approved」的入口。
//    这不是约定，是这一层唯一的写入路径。
//
// 2. **纠正靠追加，不靠改写。** 就地 UPDATE 一条已确认的记忆等于静默篡改
//    历史：昨天的结论被今天的覆盖，而没有任何痕迹说明它变过；一旦改错，
//    连「原来的说法是什么」都查不回来。correct() 写新的一条，
//    用 superseded_by 指过去，两条都在。
//
// 3. **被取代的、有冲突的，都不参与检索。** 它们不再是「已验证事实」，
//    喂给模型当作依据就是把争议当结论用。

import { createHash, randomUUID } from 'node:crypto';
import {
  proposeMemory,
  reviewMemory,
  getMemoryProvenance,
  linkMemoryToNote,
  unlinkMemoryFromNote,
  listNotesForMemory,
} from '../db/store.mjs';
import { getSetting, setSetting } from '../db/settings.mjs';

const CONTENT_MAX = 4000;

/** 自动提取的开关名。默认开 —— 但调用方必须显式查它，见 isAutoCaptureEnabled。 */
export const AUTO_CAPTURE_KEY = 'memory.autoCapture';

const now = () => new Date().toISOString();

/**
 * 内容规范化，用于去重。
 *
 * **NFKC 不能省**：中文环境里全角与半角、兼容字符会混着出现
 * （`（` vs `(`、`１` vs `1`），不做兼容分解的话，
 * 内容相同的两条会被算成不同的。大小写折叠同理，服务于英文。
 */
export function normalizeContent(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 去重键：规范化内容的 sha256 前 16 位。存前 16 位足够区分，也省空间。 */
export function dedupKeyOf(text) {
  return createHash('sha256')
    .update(normalizeContent(text), 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function requireContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('记忆内容不能为空');
  }
  if (content.length > CONTENT_MAX) {
    throw new Error(`记忆内容过长（上限 ${CONTENT_MAX} 字符）`);
  }
  return content.trim();
}

function row(db, id) {
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id) ?? null;
}

/**
 * 「可以当依据用」的条件，集中在一处。
 *
 * 三条：已确认、未被取代、不在冲突组里。
 * 语义检索与关键词检索都必须在同一组条件下取数 —— 各写一份迟早会漂移，
 * 而漂移的表现是「换个检索方式就冒出一些不该出现的记忆」。
 */
const RETRIEVABLE = `status = 'approved'
  AND superseded_by IS NULL
  AND conflict_group IS NULL`;

export function createMemoryService(db, { env = process.env } = {}) {
  return {
    // ── 添加 ──

    /**
     * 写入一条**待审核**记忆。
     *
     * 返回值里的 `duplicates` 是**提示**，不是阻止：合并是一种判断，
     * 判断留给人。这里只做「规范化后逐字相同」这种确定的判定。
     *
     * @param {'user'|'auto'} [opts.source] 谁发起的这次提取。
     *
     * **`'auto'` 会被自动记忆开关拦截，`'user'` 不会。** 这个区分是必要的：
     * 开关的名字是「自动提取」，而人去点「存为记忆」是明确要求，
     * 把两者一起拦掉等于「我把自动关了，结果手动也存不进去」。
     *
     * 目前只有 `'user'` 这一条真实路径（没有自动提取器）。
     * 把这个参数做成**必填语义**而不是可选装饰，是为了让将来接自动提取的人
     * 必须显式声明自己是自动的 —— 声明了才会被开关拦住，
     * 而默认值选 `'auto'`（保守侧）而不是 `'user'`，
     * 免得新调用方忘了写就绕过了开关。
     */
    add({
      content,
      sourceEntryId = null,
      sourceMessageId = null,
      confidence = 0,
      visibility = 'private',
      source = 'auto',
    }) {
      if (source === 'auto' && !this.isAutoCaptureEnabled()) {
        throw new Error(
          '自动提取记忆已关闭，本次提取被跳过。' +
            '要恢复请在配置里打开 memory.autoCapture；' +
            '手动提取不受此开关影响。',
        );
      }
      const text = requireContent(content);
      // 在**插入之前**查重：插入之后自己也算一条，会把自己报成重复
      const duplicates = this.findDuplicates(text);

      const memory = proposeMemory(db, {
        content: text,
        sourceEntryId,
        confidence,
      });
      if (sourceMessageId) {
        db.prepare(
          'UPDATE memories SET source_message_id = ? WHERE id = ?',
        ).run(sourceMessageId, memory.id);
      }
      db.prepare(
        'UPDATE memories SET dedup_key = ?, visibility = ?, updated_at = ? WHERE id = ?',
      ).run(dedupKeyOf(text), visibility, now(), memory.id);

      return { memory: row(db, memory.id), duplicates };
    },

    // ── 审核 ──

    review(id, decision) {
      return reviewMemory(db, id, decision);
    },

    // ── 纠正（追加式）──

    /**
     * 纠正一条已确认的记忆：**写新的一条，把旧的标记为被取代**。
     *
     * 新记忆直接是 approved —— 因为纠正这个动作本身就是人的判断，
     * 而审核门禁防的是「AI 自动总结被当成事实」，不是防人。
     * 但只有 approved 的记忆才能被纠正：纠正一条还没生效的东西没有意义。
     */
    correct(id, { content, confidence = 1 } = {}) {
      const old = row(db, id);
      if (!old) throw new Error(`记忆不存在：${id}`);
      if (old.status !== 'approved') {
        throw new Error(
          `只有已确认的记忆才能纠正（当前状态 ${old.status}）：` +
            '纠正一条尚未生效、或已被拒绝的记忆没有意义',
        );
      }
      if (old.superseded_by) {
        throw new Error(`这条记忆已经被取代过：${id} → ${old.superseded_by}`);
      }

      const text = requireContent(content);
      const newId = randomUUID();
      const ts = now();
      db.exec('BEGIN');
      try {
        db.prepare(
          `INSERT INTO memories
             (id, content, source_entry_id, source_message_id, confidence,
              status, created_at, reviewed_at, updated_at, dedup_key, visibility)
           VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
        ).run(
          newId,
          text,
          old.source_entry_id,
          old.source_message_id,
          confidence,
          ts,
          ts,
          ts,
          dedupKeyOf(text),
          old.visibility,
        );
        // 旧的那条**留着**，只是不再生效 —— 这是可审计的关键
        db.prepare(
          'UPDATE memories SET superseded_by = ?, updated_at = ? WHERE id = ?',
        ).run(newId, ts, id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw new Error(`纠正失败，已回滚：${error.message}`);
      }
      return { previous: row(db, id), current: row(db, newId) };
    },

    /** 一条记忆被谁取代了（追这条链，能还原出它被改过几次）。 */
    supersessionChain(id) {
      const chain = [];
      let current = row(db, id);
      const seen = new Set();
      while (current) {
        if (seen.has(current.id)) break; // 数据被外部改坏时不死循环
        seen.add(current.id);
        chain.push(current);
        current = current.superseded_by ? row(db, current.superseded_by) : null;
      }
      return chain;
    },

    // ── 删除 ──

    remove(id) {
      const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
      return result.changes > 0;
    },

    // ── 检索 ──

    /**
     * 关键词检索。**只返回可以当依据用的那些。**
     *
     * @param {object} [opts]
     * @param {boolean} [opts.includeConflicted] 默认 false ——
     *   有冲突的记忆是「尚未裁决的说法」，不该当作依据喂出去
     * @param {string}  [opts.visibility] 只取某个可见性；默认不限制
     */
    search(
      query,
      { limit = 20, includeConflicted = false, visibility = null } = {},
    ) {
      const q = String(query ?? '').trim();
      if (!q) return [];
      const conditions = [
        includeConflicted
          ? "status = 'approved' AND superseded_by IS NULL"
          : RETRIEVABLE,
      ];
      // 占位符顺序必须与 SQL 里出现的顺序完全一致 —— 这里曾经写反过，
      // 而参数错位不会报错，只会返回错误的行
      const params = [];
      if (visibility) {
        conditions.push('visibility = ?');
        params.push(visibility);
      }
      conditions.push('content LIKE ?');
      params.push(`%${q}%`);
      params.push(limit);
      return db
        .prepare(
          `SELECT * FROM memories WHERE ${conditions.join(' AND ')}
             ORDER BY created_at DESC LIMIT ?`,
        )
        .all(...params);
    },

    /** 把任意来源（含语义检索）的结果过滤成「可当依据用」的那些。 */
    filterRetrievable(memories) {
      const ok = new Set(
        db
          .prepare(`SELECT id FROM memories WHERE ${RETRIEVABLE}`)
          .all()
          .map((r) => r.id),
      );
      return memories.filter((m) => ok.has(m.id));
    },

    // ── 列举与来源 ──

    list({ status = 'approved', limit = 200 } = {}) {
      return db
        .prepare(
          `SELECT * FROM memories WHERE status = ?
             ORDER BY created_at DESC LIMIT ?`,
        )
        .all(status, limit);
    },

    provenance(id) {
      return getMemoryProvenance(db, id);
    },

    // ── 关联知识库 ──

    linkToNote(memoryId, noteId) {
      return linkMemoryToNote(db, memoryId, noteId);
    },
    unlinkFromNote(memoryId, noteId) {
      return unlinkMemoryFromNote(db, memoryId, noteId);
    },
    notesFor(id) {
      return listNotesForMemory(db, id);
    },

    // ── 去重 ──

    /**
     * 找出内容规范化后相同的记忆（含已取代与被拒绝的 —— 它们同样说明
     * 「这句话已经被记过一次了」）。
     */
    findDuplicates(content) {
      const key = dedupKeyOf(requireContent(content));
      return db
        .prepare(
          'SELECT * FROM memories WHERE dedup_key = ? ORDER BY created_at',
        )
        .all(key);
    },

    /** 回填去重键（迁移前写入的记忆没有这个字段）。 */
    backfillDedupKeys() {
      const rows = db
        .prepare('SELECT id, content FROM memories WHERE dedup_key IS NULL')
        .all();
      const stmt = db.prepare('UPDATE memories SET dedup_key = ? WHERE id = ?');
      db.exec('BEGIN');
      try {
        for (const r of rows) stmt.run(dedupKeyOf(r.content), r.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return rows.length;
    },

    // ── 冲突标记 ──

    /**
     * 把若干条记忆标成互相冲突。
     *
     * **只支持人工标记**，这不只是「暂时没做自动检测」：
     * 判定两句话矛盾需要语义理解，本地没有可靠手段，
     * 而假装能判会产出「系统认为它们不冲突」这种没人验证过的结论 ——
     * 那比不判更危险，因为它带着系统背书的语气。
     */
    flagConflict(ids, { group = randomUUID() } = {}) {
      if (!Array.isArray(ids) || ids.length < 2) {
        throw new Error('冲突至少需要两条记忆');
      }
      for (const id of ids) {
        if (!row(db, id)) throw new Error(`记忆不存在：${id}`);
      }
      const stmt = db.prepare(
        'UPDATE memories SET conflict_group = ?, updated_at = ? WHERE id = ?',
      );
      const ts = now();
      db.exec('BEGIN');
      try {
        for (const id of ids) stmt.run(group, ts, id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return group;
    },

    clearConflict(group) {
      return db
        .prepare(
          'UPDATE memories SET conflict_group = NULL, updated_at = ? WHERE conflict_group = ?',
        )
        .run(now(), group).changes;
    },

    conflicts() {
      return db
        .prepare(
          `SELECT * FROM memories WHERE conflict_group IS NOT NULL
             ORDER BY conflict_group, created_at`,
        )
        .all();
    },

    // ── 可见性 ──

    setVisibility(id, visibility) {
      if (!['private', 'exportable'].includes(visibility)) {
        throw new Error(
          `可见性只能是 private 或 exportable，收到 ${visibility}`,
        );
      }
      const changed = db
        .prepare(
          'UPDATE memories SET visibility = ?, updated_at = ? WHERE id = ?',
        )
        .run(visibility, now(), id).changes;
      if (changed === 0) throw new Error(`记忆不存在：${id}`);
      return row(db, id);
    },

    /** 可对外导出的记忆。默认空 —— 必须逐条显式放行。 */
    exportable({ limit = 1000 } = {}) {
      return db
        .prepare(
          `SELECT * FROM memories
            WHERE visibility = 'exportable' AND ${RETRIEVABLE}
            ORDER BY created_at DESC LIMIT ?`,
        )
        .all(limit);
    },

    // ── 自动记忆开关 ──

    /**
     * 自动提取是否开启。**默认开**，但取值失败时按**关**处理 ——
     * 读不到配置时宁可什么都不记，也不要擅自开始记录。
     */
    isAutoCaptureEnabled() {
      try {
        return getSetting(db, AUTO_CAPTURE_KEY, env) !== 'false';
      } catch {
        return false;
      }
    },

    setAutoCapture(enabled) {
      setSetting(db, AUTO_CAPTURE_KEY, enabled ? 'true' : 'false');
      return this.isAutoCaptureEnabled();
    },
  };
}
