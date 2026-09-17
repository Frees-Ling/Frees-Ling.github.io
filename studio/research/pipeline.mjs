// 研究与审查流水线（KNOW-002）。
//
// ── 它解决的是什么问题 ──
//
// AI 可以写得很像样。危险不在于它写得差，在于**它写得像真的** ——
// 一段没有出处的论断，读起来和一段有出处的论断没有区别。
// 所以这一层的核心不是「让 AI 写研究」，是让「**哪些话有依据**」
// 变成结构里的一个字段，而不是留在语气里。
//
// 四件事：
//
//   ① 查重   —— 一条主张与已有知识重复时不重复记录，但**指出来**
//   ② 分级   —— 来源按域名判定可信度（见 sources.mjs）
//   ③ 校验   —— 没有够格来源的主张被标出来，不静默通过
//   ④ 审查队列 —— 主张要**人批准**才能算数，AI 批准不了（库层约束）
//
// ── 「AI 不可绕过人工发布」是怎么保证的 ──
//
// 不是靠这一层的函数写得小心，而是靠迁移 v11 里的
// `CHECK (status <> 'approved' OR decided_by = 'human')`。
// 这里所有会写 `approved` 的路径都必须带 `decided_by: 'human'`，
// 而带不出来的路径会被数据库直接拒绝。
//
// 一句话：**这一层可以写错，但写错了也绕不过去。**

import { randomUUID } from 'node:crypto';

import { dedupKeyOf } from '../memory/service.mjs';
import { isSupported, strongestTier, TIER_LABEL, tierOf } from './sources.mjs';

const now = () => new Date().toISOString();

/** 主张的来源类型。与 memory 的 origin 语义保持一致。 */
export const ORIGINS = ['human', 'ai'];
/** 审查状态。 */
export const STATUSES = ['pending', 'approved', 'rejected'];

function toClaim(row, sources = []) {
  return {
    id: row.id,
    text: row.text,
    origin: row.origin,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    note: row.note,
    sources,
    strongestTier: strongestTier(sources),
    supported: isSupported(sources),
  };
}

function sourcesFor(db, claimId) {
  return db
    .prepare(
      'SELECT title, url, tier, note FROM claim_sources WHERE claim_id = ? ORDER BY title',
    )
    .all(claimId);
}

/**
 * 记一条主张。
 *
 * **默认进 pending**，无论来源是人还是 AI。没有「因为是人写的所以自动通过」——
 * 那条捷径一旦存在，AI 只要把自己标成 human 就绕过去了。
 * 人工来源的唯一区别是它的 origin 字段不同，审查一步不少。
 */
export function recordClaim(
  db,
  { text, sources = [], origin = 'human', note = null },
) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('主张内容不能为空');
  }
  if (!ORIGINS.includes(origin)) {
    throw new Error(`未知的来源类型：${origin}`);
  }

  const key = dedupKeyOf(text);
  const existing = db
    .prepare('SELECT * FROM claims WHERE dedup_key = ?')
    .get(key);
  if (existing) {
    // 重复不新建，但要能被调用方看见 —— 静默返回旧记录会让调用方
    // 以为「记下了」，而实际什么也没发生
    return {
      claim: toClaim(existing, sourcesFor(db, existing.id)),
      deduped: true,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO claims (id, text, origin, status, dedup_key, created_at, note)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
  ).run(id, text.trim(), origin, key, now(), note);

  for (const s of sources) {
    addSource(db, id, s);
  }

  return { claim: describeClaim(db, id), deduped: false };
}

/** 给一条主张加来源。tier **不由调用方决定**，按域名算。 */
export function addSource(db, claimId, { title, url = null, note = null }) {
  if (!title || !title.trim()) throw new Error('来源需要有标题');
  db.prepare(
    `INSERT INTO claim_sources (claim_id, title, url, tier, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (claim_id, title) DO UPDATE
       SET url = excluded.url, tier = excluded.tier, note = excluded.note`,
  ).run(claimId, title.trim(), url, tierOf(url), note);
  return sourcesFor(db, claimId);
}

export function describeClaim(db, id) {
  const row = db.prepare('SELECT * FROM claims WHERE id = ?').get(id);
  return row ? toClaim(row, sourcesFor(db, id)) : null;
}

/**
 * 审查队列。
 *
 * 默认只列 pending —— 「等我看的东西」是队列的本分。
 */
export function reviewQueue(db, { status = 'pending', limit = 200 } = {}) {
  if (status !== 'all' && !STATUSES.includes(status)) {
    throw new Error(`未知的审查状态：${status}`);
  }
  const rows =
    status === 'all'
      ? db
          .prepare('SELECT * FROM claims ORDER BY created_at LIMIT ?')
          .all(limit)
      : db
          .prepare(
            'SELECT * FROM claims WHERE status = ? ORDER BY created_at LIMIT ?',
          )
          .all(status, limit);
  return rows.map((r) => toClaim(r, sourcesFor(db, r.id)));
}

/**
 * 批准或否决一条主张。
 *
 * `decidedBy` **必须显式给**，没有默认值 —— 一个默认值会让调用方
 * 在没想清楚的时候替 AI 做了人的决定。给了 `'ai'` 却又想批准，
 * 数据库会拒绝（v11 的 CHECK），这里先把话说清楚。
 */
export function decide(db, id, { status, decidedBy, note = null }) {
  if (!STATUSES.includes(status) || status === 'pending') {
    throw new Error(`审查结论只能是 approved 或 rejected，收到：${status}`);
  }
  if (decidedBy !== 'human' && decidedBy !== 'ai') {
    throw new Error('必须显式说明是谁做出的结论（human / ai）');
  }
  if (status === 'approved' && decidedBy !== 'human') {
    throw new Error(
      '只有人才能批准一条主张 —— AI 可以提议、可以否决，但不能让它生效。',
    );
  }

  const claim = describeClaim(db, id);
  if (!claim) throw new Error(`没有这条主张：${id}`);

  db.prepare(
    'UPDATE claims SET status = ?, decided_at = ?, decided_by = ?, note = COALESCE(?, note) WHERE id = ?',
  ).run(status, now(), decidedBy, note, id);
  return describeClaim(db, id);
}

/**
 * 主张与已有知识的查重候选。
 *
 * 复用 `memory/service.mjs` 的 `dedupKeyOf` —— 两套「什么算重复」的
 * 定义会让人无从判断该信哪个。这里只做**完全相同**的判定；
 * 「说得差不多」需要语义判断，那是候选列表的事，不是自动合并的事。
 */
export function findDuplicates(db, text) {
  const key = dedupKeyOf(text);
  return db
    .prepare('SELECT * FROM claims WHERE dedup_key = ?')
    .all(key)
    .map((r) => toClaim(r, sourcesFor(db, r.id)));
}

/**
 * 校验一批主张，返回问题清单。
 *
 * **只报告，不修改。** 一条没有来源的主张不该被自动删除或改写成
 * 「无来源」—— 它该留在队列里，由人决定补来源还是撤掉。
 */
export function validateClaims(db, { limit = 500 } = {}) {
  const issues = [];
  for (const claim of reviewQueue(db, { limit })) {
    if (claim.sources.length === 0) {
      issues.push({
        claimId: claim.id,
        kind: 'unsourced',
        message: `没有来源：${claim.text.slice(0, 40)}`,
      });
      continue;
    }
    if (!claim.supported) {
      issues.push({
        claimId: claim.id,
        kind: 'weak-source',
        message:
          `来源强度不足（${TIER_LABEL[claim.strongestTier]}）：` +
          claim.text.slice(0, 40),
      });
    }
  }
  return issues;
}

// ── 冲突 ──

/**
 * 把若干主张标为互相冲突。
 *
 * **由人或 AI 显式标记，不自动推断。** 与 MEM-001 的
 * `flagConflict` 同一设计：两句话是否矛盾需要语义判断，
 * 而猜出来的冲突会以假乱真 —— 它长得和真的冲突一模一样。
 */
export function flagConflict(db, claimIds, { group = randomUUID() } = {}) {
  if (!Array.isArray(claimIds) || claimIds.length < 2) {
    throw new Error('冲突至少涉及两条主张');
  }
  for (const id of claimIds) {
    if (!describeClaim(db, id)) throw new Error(`没有这条主张：${id}`);
  }
  const stmt = db.prepare(
    `INSERT INTO claim_conflicts (group_id, claim_id, created_at)
     VALUES (?, ?, ?) ON CONFLICT (group_id, claim_id) DO NOTHING`,
  );
  for (const id of claimIds) stmt.run(group, id, now());
  return group;
}

export function conflicts(db) {
  const rows = db
    .prepare(
      `SELECT group_id, claim_id FROM claim_conflicts ORDER BY group_id, created_at`,
    )
    .all();
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, []);
    byGroup.get(r.group_id).push(r.claim_id);
  }
  return (
    [...byGroup.entries()]
      .map(([group, ids]) => ({
        group,
        claims: ids.map((id) => describeClaim(db, id)).filter(Boolean),
      }))
      // **只剩一条的不算冲突**：一条主张无法与自己矛盾。
      // 删掉冲突中的一方之后，分组行仍会留一条（外键级联只清掉被删那条），
      // 若不在这里过滤，`conflicts()` 会一直报出一个单成员的「冲突」——
      // 而那个列表的每一项都该是**需要人去看的**，塞进假项就是噪音。
      .filter((g) => g.claims.length >= 2)
  );
}

export function clearConflict(db, group) {
  return db.prepare('DELETE FROM claim_conflicts WHERE group_id = ?').run(group)
    .changes;
}

/** 一条主张是否处在未解决的冲突里。 */
export function conflictFor(db, claimId) {
  const row = db
    .prepare('SELECT group_id FROM claim_conflicts WHERE claim_id = ? LIMIT 1')
    .get(claimId);
  return row?.group_id ?? null;
}
