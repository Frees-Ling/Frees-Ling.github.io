// 知识库存储层：schema 与迁移。
//
// 用 Node 26 内置的 node:sqlite，不引入 better-sqlite3 之类的原生模块 ——
// 后者需要编译，跨平台与升级 Node 时都会成为负担，而本项目只需要
// 「可靠的本地单文件数据库 + 全文检索」，内置能力已经够用。
//
// 迁移策略：schema_version 表记录已应用的版本，迁移按序号顺序执行，
// 每个迁移在**一个事务里**完成。失败即整体回滚，不会留下半应用的状态。

import { DatabaseSync } from 'node:sqlite';

/**
 * 迁移列表。**只能追加，不能修改已发布的迁移** ——
 * 改动历史迁移会让已经升级过的库与新库产生不同的结构。
 */
const MIGRATIONS = [
  {
    version: 1,
    name: 'initial',
    up: (db) => {
      // ── 元信息 ──
      db.exec(`
        CREATE TABLE meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // ── 知识库条目（第三层：正式整理的笔记与文章）──
      //
      // origin 区分「人写的」与「AI 起草的」。这是三层模型里
      // 「AI 生成不得直接当作已验证事实」在数据层的落点：
      // AI 起草的内容带着 origin='ai_draft' 进入，必须经人工确认才改状态。
      db.exec(`
        CREATE TABLE notes (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL,
          body       TEXT NOT NULL DEFAULT '',
          kind       TEXT NOT NULL DEFAULT 'note',
          status     TEXT NOT NULL DEFAULT 'draft',
          origin     TEXT NOT NULL DEFAULT 'human',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (kind   IN ('note', 'article')),
          CHECK (status IN ('draft', 'ready', 'published')),
          CHECK (origin IN ('human', 'ai_draft'))
        );
      `);

      db.exec(`CREATE INDEX idx_notes_updated ON notes (updated_at DESC);`);
      db.exec(`CREATE INDEX idx_notes_status  ON notes (status);`);

      db.exec(`
        CREATE TABLE tags (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE note_tags (
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (note_id, tag_id)
        );
      `);

      // ── 引用关系 —— 与公开站的 relations.ts 同构（按共享标签算关联），
      //    这里存的是**人工确认过的**显式引用，不存算法推断的结果。
      //    推断结果每次按需计算即可，存下来只会过期。
      db.exec(`
        CREATE TABLE links (
          from_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          to_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          kind    TEXT NOT NULL DEFAULT 'see-also',
          PRIMARY KEY (from_id, to_id, kind),
          CHECK (from_id <> to_id)
        );
      `);

      // ── 原始档案（第一层：完整历史，不可被摘要替代）──
      db.exec(`
        CREATE TABLE archive_entries (
          id         TEXT PRIMARY KEY,
          kind       TEXT NOT NULL,
          source     TEXT NOT NULL,
          content    TEXT NOT NULL,
          created_at TEXT NOT NULL,
          hash       TEXT NOT NULL,
          CHECK (kind IN ('conversation', 'document', 'edit'))
        );
      `);
      // hash 用于增量导入的去重 —— 重复导入同一份导出文件必须幂等
      db.exec(
        `CREATE UNIQUE INDEX idx_archive_hash ON archive_entries (hash);`,
      );

      // ── 长期记忆（第二层：从档案提取、经人工审核）──
      db.exec(`
        CREATE TABLE memories (
          id              TEXT PRIMARY KEY,
          content         TEXT NOT NULL,
          source_entry_id TEXT REFERENCES archive_entries(id) ON DELETE SET NULL,
          confidence      REAL NOT NULL DEFAULT 0,
          status          TEXT NOT NULL DEFAULT 'pending',
          created_at      TEXT NOT NULL,
          reviewed_at     TEXT,
          CHECK (status IN ('pending', 'approved', 'rejected')),
          CHECK (confidence >= 0 AND confidence <= 1)
        );
      `);
      db.exec(`CREATE INDEX idx_memories_status ON memories (status);`);

      // ── 全文检索 ──
      //
      // 中文没有词边界，默认分词器按空白切会把整句当一个词。
      // 这里用 trigram —— 它对中文可用且不引入额外依赖。
      // 代价是索引更大、不支持前缀查询，但对「找得到我写过的那句话」这个
      // 真实需求足够，而那个需求正是知识库的核心价值。
      db.exec(`
        CREATE VIRTUAL TABLE notes_fts USING fts5 (
          title, body,
          content='notes', content_rowid='rowid',
          tokenize='trigram'
        );
      `);
      // 用触发器保持索引与数据一致 —— 放在应用层做迟早会漏
      db.exec(`
        CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts (rowid, title, body)
          VALUES (new.rowid, new.title, new.body);
        END;
        CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
          INSERT INTO notes_fts (notes_fts, rowid, title, body)
          VALUES ('delete', old.rowid, old.title, old.body);
        END;
        CREATE TRIGGER notes_fts_update AFTER UPDATE ON notes BEGIN
          INSERT INTO notes_fts (notes_fts, rowid, title, body)
          VALUES ('delete', old.rowid, old.title, old.body);
          INSERT INTO notes_fts (rowid, title, body)
          VALUES (new.rowid, new.title, new.body);
        END;
      `);
    },
  },
  {
    version: 2,
    name: 'conversations',
    up: (db) => {
      // ── 对话与消息（AI Studio 的基础）──
      //
      // 归属：conversations 属于「知识库」这一层的**工作记录**，
      // 不是原始档案也不是长期记忆。它与两者都不混淆：
      //   · 原始档案（archive_entries）是导入的历史，只增不改
      //   · 长期记忆（memories）必须经人工审核
      //   · 对话是「我在这里问过什么」的运行痕迹，可删可清
      db.exec(`
        CREATE TABLE conversations (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL DEFAULT '',
          model      TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.exec(
        `CREATE INDEX idx_conv_updated ON conversations (updated_at DESC);`,
      );

      db.exec(`
        CREATE TABLE messages (
          id              TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role            TEXT NOT NULL,
          content         TEXT NOT NULL,
          -- 引用的知识库条目 id 列表（JSON 数组）。存下来是为了可追溯：
          -- 「这句回答是基于哪几条笔记」必须能事后查证
          citations       TEXT NOT NULL DEFAULT '[]',
          created_at      TEXT NOT NULL,
          CHECK (role IN ('system', 'user', 'assistant'))
        );
      `);
      db.exec(
        `CREATE INDEX idx_msg_conv ON messages (conversation_id, created_at);`,
      );
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * 打开数据库并升级到最新 schema。
 *
 * @param {string} path 数据库路径，或 ':memory:'（测试用）
 * @returns {DatabaseSync}
 */
export function openDatabase(path) {
  const db = new DatabaseSync(path);

  // WAL 让读写不互相阻塞；外键约束默认是关的，必须显式打开，
  // 否则上面的 REFERENCES 与 ON DELETE CASCADE 全是装饰。
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_version')
      .all()
      .map((row) => row.version),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare(
        'INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(
        `迁移 ${migration.version}（${migration.name}）失败，已回滚：${error.message}`,
      );
    }
  }

  return db;
}

/** 当前库的 schema 版本，用于诊断。 */
export function currentVersion(db) {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  return row?.v ?? 0;
}
