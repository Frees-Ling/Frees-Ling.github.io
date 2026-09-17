// 编辑会话：记住「上次在编辑什么」（EDITOR-001）。
//
// 用户关掉浏览器、重启 Studio、隔天回来 —— 应当回到原来那一段，
// 而不是空白编辑器。**未保存的改动也要一起回来**：那正是最不能丢的部分。

const KEY = 'current';

const now = () => new Date().toISOString();

const TAGS_MAX = 200;
const TITLE_MAX = 500;
const BODY_MAX = 2_000_000;

function parseTags(raw) {
  try {
    const tags = JSON.parse(raw);
    return Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [];
  } catch {
    // 库被外部改坏时返回空数组而不是抛错：会话丢了是小事，
    // 让编辑器打不开是大事
    return [];
  }
}

/**
 * 读取当前编辑会话；没有则返回 null。
 *
 * 笔记已被删除时 `note_id` 会是 null（外键 ON DELETE SET NULL），
 * 但**标题与正文仍然返回** —— 用户可能正在写一条还没保存的笔记，
 * 删掉另一条不该连带抹掉它。
 *
 * 这里原本还有一个 `orphaned` 标记，想区分「在写新笔记」与
 * 「在编的笔记被删了」。**它是死代码**：外键的 ON DELETE SET NULL
 * 已经把 note_id 置空，那个条件永远不会成立。与其留一个从不触发的分支
 * 让后来的人以为它在工作，不如去掉 —— 两种情况对用户是一样的：
 * 内容都在，接着写就是了。
 *
 * `noteExists` 这个检查保留着：外键开着时它是多余的，
 * 但外键是 PRAGMA 控制的，不保证每个打开路径都开着。
 * 多一次查询换「绝不把不存在的 id 交给前端」，划算。
 */
export function getSession(db) {
  const row = db.prepare('SELECT * FROM editor_sessions WHERE id = ?').get(KEY);
  if (!row) return null;

  // 期间那条笔记被删了：把 note_id 视为空，让它以「新建」的形态恢复，
  // 而不是让前端拿着一个不存在的 id 去请求
  const noteExists = row.note_id
    ? db.prepare('SELECT 1 AS ok FROM notes WHERE id = ?').get(row.note_id)
    : null;

  return {
    noteId: noteExists ? row.note_id : null,
    title: row.title,
    body: row.body,
    tags: parseTags(row.tags),
    dirty: row.dirty === 1,
    updatedAt: row.updated_at,
  };
}

/**
 * 保存编辑会话。
 *
 * 刻意**不校验** title/body 与笔记的一致性 —— 这里存的是「草稿状态」，
 * 草稿允许不完整（没标题、正文空）。校验属于保存笔记那一步。
 */
export function saveSession(
  db,
  { noteId = null, title = '', body = '', tags = [], dirty = false } = {},
) {
  if (typeof title !== 'string' || title.length > TITLE_MAX) {
    throw new Error(`标题过长（上限 ${TITLE_MAX} 字符）`);
  }
  if (typeof body !== 'string' || body.length > BODY_MAX) {
    throw new Error(`正文过长（上限 ${BODY_MAX} 字符）`);
  }
  if (!Array.isArray(tags) || tags.length > TAGS_MAX) {
    throw new Error(`标签过多或格式不对（上限 ${TAGS_MAX} 个）`);
  }

  db.prepare(
    `INSERT INTO editor_sessions (id, note_id, title, body, tags, dirty, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       note_id = excluded.note_id, title = excluded.title, body = excluded.body,
       tags = excluded.tags, dirty = excluded.dirty, updated_at = excluded.updated_at`,
  ).run(
    KEY,
    noteId,
    title,
    body,
    JSON.stringify(tags.filter((t) => typeof t === 'string')),
    dirty ? 1 : 0,
    now(),
  );

  return getSession(db);
}

export function clearSession(db) {
  return (
    db.prepare('DELETE FROM editor_sessions WHERE id = ?').run(KEY).changes > 0
  );
}
