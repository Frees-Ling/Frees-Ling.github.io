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
  {
    version: 3,
    name: 'memory-links',
    up: (db) => {
      // ── 把三层连起来（KB-005）──
      //
      // 此前三层各自存在但互不连通：
      //   档案（archive_entries）· 记忆（memories）· 知识库（notes）· 对话（messages）
      // 已有的连接只有 memories.source_entry_id → archive_entries。
      //
      // 这里补两条：
      //   ① 记忆可以来自一条对话消息（AI 从对话里提取的结论）
      //   ② 记忆可以关联到知识库条目（这条结论在哪几篇笔记里被用到/印证）

      // ① 来源消息。用 ALTER 而不是重建表 —— 已有数据必须保留。
      //    ON DELETE SET NULL 而非 CASCADE：删掉一条对话不该抹掉它产生的记忆，
      //    那等于用一次清理动作销毁一条已确认的结论。来源没了就置空。
      db.exec(`
        ALTER TABLE memories ADD COLUMN source_message_id TEXT
          REFERENCES messages(id) ON DELETE SET NULL;
      `);

      // ② 记忆 ↔ 知识库条目的多对多
      db.exec(`
        CREATE TABLE memory_notes (
          memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (memory_id, note_id)
        );
      `);
      db.exec(`CREATE INDEX idx_memory_notes_note ON memory_notes (note_id);`);
    },
  },
  {
    version: 4,
    name: 'embeddings',
    up: (db) => {
      // ── 语义检索的向量存储（KB-007）──
      //
      // 刻意**不引入向量数据库**。个人知识库的规模是几百到几千条，
      // 在 JS 里暴力算余弦相似度是毫秒级的事，而引入 Qdrant/Milvus 之类
      // 意味着多一个服务、多一份备份负担、多一种会过期的格式。
      // 规模真正变大（十万条以上）时再换，那时也知道该换什么。
      //
      // 向量存 BLOB（Float32 的字节表示），不是 JSON 文本 ——
      // JSON 会大 3-5 倍且每次读写都要解析。
      db.exec(`
        CREATE TABLE embeddings (
          owner_kind TEXT NOT NULL,
          owner_id   TEXT NOT NULL,
          model      TEXT NOT NULL,
          dim        INTEGER NOT NULL,
          vector     BLOB NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (owner_kind, owner_id),
          CHECK (owner_kind IN ('note', 'memory'))
        );
      `);
      // 换嵌入模型后旧向量不可用，按 model 区分便于重建
      db.exec(`CREATE INDEX idx_emb_model ON embeddings (model);`);
    },
  },
  {
    version: 5,
    name: 'settings',
    up: (db) => {
      // ── 可配置项（STUDIO-003）──
      //
      // 一张极简的键值表。**不存任何密钥值** —— 敏感项在 value 里存的是
      // 一个**引用**（指向环境变量或钥匙串条目），真正的值在用到时才去取。
      // 见 db/settings.mjs 的 requireSecretRef：往敏感槽写明文会被拒绝。
      //
      // 为什么不做成每个配置一个列：配置项会增删，而 ALTER TABLE 加列
      // 意味着每次都要写一个迁移。键值表让「加一个配置项」变成纯代码改动。
      db.exec(`
        CREATE TABLE settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 6,
    name: 'memory-service',
    up: (db) => {
      // ── 长期记忆的纠正、去重、冲突与可见性（MEM-001）──
      //
      // ── 为什么纠正不用「就地改写」──
      //
      // 就地 UPDATE 一条已确认的记忆，等于**静默篡改历史**：
      // 昨天的结论被今天的改写覆盖，而没有任何痕迹说明它变过。
      // 如果改写本身判错了（人来改也会错），那就连「原来的说法是什么」
      // 都查不回来了。
      //
      // 所以纠正是**追加**：新写一条记忆，把旧的用 superseded_by 指过去。
      // 两条都在，改的是「哪一条生效」。这与 ADR-023 里借鉴 Mem0 的那条
      // 设计（ADD-only + 互链）是同一个理由。
      //
      // ── 为什么去重键是算出来的而不是判出来的 ──
      //
      // 「这两条是不是在说同一件事」需要语义判断，本地没有可靠手段。
      // 但「规范化之后逐字相同」是确定的，且能挡掉绝大多数重复 ——
      // AI 反复从同一段对话里提取同一句话是最常见的情形。
      // 它只做**提示**，不自动合并：合并是判断，判断要留给人。
      db.exec(`ALTER TABLE memories ADD COLUMN updated_at TEXT;`);
      db.exec(`ALTER TABLE memories ADD COLUMN superseded_by TEXT
                 REFERENCES memories(id) ON DELETE SET NULL;`);
      // 冲突组：同一组内的记忆互相矛盾，需要人来裁决。
      // **只支持人工标记** —— 自动判定矛盾需要语义理解，
      // 假装能判会导致「系统认为它们不冲突」这种没人验证过的结论。
      db.exec(`ALTER TABLE memories ADD COLUMN conflict_group TEXT;`);
      // 去重键：内容规范化后的 sha256 前 16 位
      db.exec(`ALTER TABLE memories ADD COLUMN dedup_key TEXT;`);
      // 可见性默认 private：记忆来自私人对话，默认不对外是唯一安全的默认值。
      // 将来 ACCESS-001 要放开时必须显式改成 exportable。
      db.exec(`ALTER TABLE memories ADD COLUMN visibility TEXT NOT NULL
                 DEFAULT 'private'`);

      db.exec(`CREATE INDEX idx_memories_dedup ON memories (dedup_key);`);
      // 注意：idx_memories_status 在 v1 就建过了。这里再加一次会让整个
      // 迁移失败 —— 实测踩到过，事务回滚保住了一致性，但迁移就是没跑成。
      db.exec(
        `CREATE INDEX idx_memories_conflict ON memories (conflict_group);`,
      );
    },
  },
  {
    version: 7,
    name: 'editor-session',
    up: (db) => {
      // ── 编辑会话（EDITOR-001）──
      //
      // 存「上次在编辑什么」，重启后能回到原处。
      //
      // ── 为什么放库里而不是 localStorage ──
      //
      // 浏览器存储能扛住刷新，但扛不住换浏览器、清缓存、隐私窗口。
      // 而这个需求的字面意思就是**重启后还在**。放在库里则由服务端保证，
      // 与浏览器无关 —— 也顺带让「重启」这件事可以被测试真正验证
      // （关掉库再打开，看还在不在）。
      //
      // 单用户本地服务，因此固定一行（id = 'current'）。
      // 不做多行不是省事，是还没有第二个用户 —— 真需要时再加列。
      db.exec(`
        CREATE TABLE editor_sessions (
          id         TEXT PRIMARY KEY,
          note_id    TEXT REFERENCES notes(id) ON DELETE SET NULL,
          title      TEXT NOT NULL DEFAULT '',
          body       TEXT NOT NULL DEFAULT '',
          tags       TEXT NOT NULL DEFAULT '[]',
          -- 是否有未保存的改动。没有改动时不必提示「恢复」，
          -- 直接打开那条笔记就行。
          dirty      INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * 打开数据库并升级到最新 schema。
 *
 * @param {string} path 数据库路径，或 ':memory:'（测试用）
 * @param {object} [options]
 * @param {number} [options.upTo] 只迁移到这个版本。
 *   **仅供测试构造「旧版本的库」**，正常运行不要传 ——
 *   传了就会拿到一个结构不完整的库，后续读写会以奇怪的方式失败。
 * @returns {DatabaseSync}
 */
export function openDatabase(path, { upTo = SCHEMA_VERSION } = {}) {
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

  // 库比程序新时**必须拒绝打开**。
  //
  // 这是版本错配里最危险的一种：降级运行（切回旧提交、跑一份旧副本）时，
  // 旧程序面对的是一张它不认识的表结构，而它**不会报错** ——
  // 它会照自己的理解去读写，把数据写坏，而且当场看不出来。
  // 宁可打不开，也不要「能打开但写坏」。
  const dbVersion = applied.size === 0 ? 0 : Math.max(...applied);
  if (dbVersion > SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `这个库的 schema 版本是 ${dbVersion}，当前程序只支持到 ${SCHEMA_VERSION}。` +
        '请用较新版本的程序打开它，或从备份恢复。' +
        '不要用旧程序继续写 —— 旧程序不认识新结构，会静默写坏数据。',
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version > upTo) break;
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
