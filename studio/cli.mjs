#!/usr/bin/env node
// 知识库命令行入口。
//
//   node studio/cli.mjs start              启动本地服务
//   node studio/cli.mjs status             显示数据规模与配置
//   node studio/cli.mjs export <file>      导出全部语义数据
//   node studio/cli.mjs import <file>      导入到空库
//   node studio/cli.mjs backup             加密备份到 WebDAV 并回读校验
//   node studio/cli.mjs restore <name>     从远端备份恢复
//   node studio/cli.mjs retention [n]      清理旧备份（默认 dry-run）
//   node studio/cli.mjs rebuild            重算全部向量
//
// 环境变量：
//   FREES_STUDIO_HOME       数据目录，默认 ~/.frees-studio
//   FREES_STUDIO_MODEL_URL  模型端点，默认 http://127.0.0.1:1234/v1
//   FREES_BACKUP_PASSPHRASE 备份口令（仅本环境变量，不进 argv/日志/文件）
//   FREES_WEBDAV_URL / _USER / _PASSWORD / _DIR   WebDAV 目标
//
// ── 为什么不打印令牌 ──
// 终端会被截图，也会进 scrollback。需要时自己去读令牌文件。

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { openDatabase, currentVersion, SCHEMA_VERSION } from './db/schema.mjs';
import { studioHome, start, loadOrCreateToken } from './server/index.mjs';
import {
  exportToFile,
  importFromFile,
  importAll,
  rebuildEmbeddings,
  countEntities,
} from './db/portable.mjs';
import { createEmbedder } from './ai/embeddings.mjs';
import { createWebdav, webdavConfigFromEnv } from './backup/webdav.mjs';
import { runBackup, runRetention } from './backup/remote.mjs';
import { decrypt } from './backup/crypto.mjs';
import {
  importFile,
  importDirectory,
  findConflicts,
} from './archive/import.mjs';
import {
  createToken,
  listTokens,
  revokeToken,
  rotateToken,
  recentAccess,
  SCOPES,
  PRESETS,
} from './access/tokens.mjs';

const command = process.argv[2];
const arg = process.argv[3];
const home = studioHome();
const dbPath = join(home, 'studio.db');

function fail(message, hint) {
  console.error(`✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exitCode = 1;
}

function openExisting() {
  if (!existsSync(dbPath)) {
    fail(
      `数据目录里还没有库：${dbPath}`,
      '先运行 node studio/cli.mjs start 初始化。',
    );
    return null;
  }
  return openDatabase(dbPath);
}

function modelUrl() {
  return process.env.FREES_STUDIO_MODEL_URL || 'http://127.0.0.1:1234/v1';
}

function makeEmbedder() {
  return createEmbedder({
    baseUrl: modelUrl(),
    model: process.env.FREES_STUDIO_EMBED_MODEL || 'nomic-embed-text-v1.5',
  });
}

const commands = {
  async status() {
    // 首次运行时库还不存在 —— 那是正常状态而不是错误，
    // 但要说清楚「还没建库」而不是显示一堆 0
    const db = existsSync(dbPath) ? openDatabase(dbPath) : null;
    console.log(`数据目录  ${home}`);
    console.log(`数据库    ${db ? dbPath : '（尚未创建）'}`);
    if (db) {
      console.log(
        `schema    版本 ${currentVersion(db)}（程序支持到 ${SCHEMA_VERSION}）`,
      );
      const counts = countEntities({
        notes: db.prepare('SELECT id FROM notes').all(),
        memories: db.prepare('SELECT id FROM memories').all(),
        archive: db.prepare('SELECT id FROM archive_entries').all(),
        conversations: db.prepare('SELECT id FROM conversations').all(),
        messages: db.prepare('SELECT id FROM messages').all(),
      });
      const pending = db
        .prepare("SELECT COUNT(*) c FROM memories WHERE status='pending'")
        .get().c;
      const approved = db
        .prepare("SELECT COUNT(*) c FROM memories WHERE status='approved'")
        .get().c;
      const vectors = db.prepare('SELECT COUNT(*) c FROM embeddings').get().c;
      const models = db
        .prepare('SELECT DISTINCT model FROM embeddings')
        .all()
        .map((r) => r.model);

      console.log(`笔记      ${counts.notes}`);
      console.log(`记忆      ${approved} 已确认 / ${pending} 待审核`);
      console.log(`档案      ${counts.archive}`);
      console.log(
        `对话      ${counts.conversations}（${counts.messages} 条消息）`,
      );
      console.log(
        `向量      ${vectors}${models.length ? `（模型：${models.join(', ')}）` : ''}`,
      );
      if (vectors > 0 && models.length > 1) {
        console.log('          ⚠ 存在多个嵌入模型的向量，建议运行 rebuild');
      }
      db.close();
    }
    console.log(`模型端点  ${modelUrl()}`);
    console.log(`令牌文件  ${join(home, 'token')}（不外显）`);
  },

  async start() {
    const { port } = await start({ home });
    console.log(`知识库服务已启动: http://127.0.0.1:${port}`);
    console.log(`数据目录: ${home}`);
  },

  async export() {
    if (!arg)
      return fail(
        '需要指定导出文件路径',
        '例：node studio/cli.mjs export ./backup.json',
      );
    // 导出是备份。静默覆盖会毁掉上一份，而人往往在需要它时才发现。
    if (existsSync(arg)) {
      return fail(
        `文件已存在：${arg}`,
        '导出是备份，覆盖会毁掉上一份。请换一个文件名，或先自行移走旧文件。',
      );
    }
    const db = openExisting();
    if (!db) return;
    try {
      const { counts } = exportToFile(db, arg);
      console.log(`✓ 已导出到 ${arg}`);
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k}  ${v}`);
      console.log('\n导出不含向量（派生数据，可由 rebuild 恢复）。');
    } finally {
      db.close();
    }
  },

  async import() {
    if (!arg) return fail('需要指定导入文件路径');
    if (!existsSync(arg)) return fail(`文件不存在：${arg}`);
    // 数据目录可能还不存在（导入到全新环境是最常见的用法）——
    // SQLite 不能在一个不存在的目录里建文件，会报 "unable to open database file"。
    // 实测踩过：测试里总是先 mkdtempSync 建目录，恰好绕过了这条路径。
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const db = openDatabase(dbPath);
    try {
      const counts = importFromFile(db, arg);
      console.log(`✓ 已从 ${arg} 导入`);
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k}  ${v}`);
      console.log('\n向量未随导出迁移，请运行 rebuild 重算。');
    } catch (error) {
      fail(error.message);
    } finally {
      db.close();
    }
  },

  async backup() {
    const db = openExisting();
    if (!db) return;
    try {
      // 口令只从环境变量取：不进 argv、不进日志、不落盘
      const passphrase = process.env.FREES_BACKUP_PASSPHRASE;
      if (!passphrase) {
        return fail(
          '未设置备份口令',
          '请通过环境变量 FREES_BACKUP_PASSPHRASE 提供。不要写进文件或命令行参数 —— ' +
            '备份的意义在于「文件泄露也没关系」，把口令与密文放一起会抵消掉它。',
        );
      }
      const cfg = webdavConfigFromEnv();
      const webdav = createWebdav(cfg);
      const result = await runBackup({
        db,
        webdav,
        dir: cfg.dir,
        passphrase,
      });
      console.log(`✓ 已备份并回读校验通过：${result.name}`);
      console.log(`  大小 ${(result.bytes / 1024).toFixed(1)} KB`);
      for (const [k, v] of Object.entries(result.counts))
        console.log(`  ${k}  ${v}`);
    } catch (error) {
      fail(error.message);
    } finally {
      db.close();
    }
  },

  async restore() {
    if (!arg) return fail('需要指定要恢复的备份文件名');
    const passphrase = process.env.FREES_BACKUP_PASSPHRASE;
    if (!passphrase)
      return fail('未设置备份口令', '通过 FREES_BACKUP_PASSPHRASE 提供。');
    try {
      const cfg = webdavConfigFromEnv();
      const webdav = createWebdav(cfg);
      const packed = await webdav.get(`${cfg.dir.replace(/\/+$/, '')}/${arg}`);
      if (!packed) return fail(`远端没有这个备份：${arg}`);

      const data = JSON.parse(decrypt(packed, passphrase).toString('utf8'));
      mkdirSync(home, { recursive: true, mode: 0o700 });
      const db = openDatabase(dbPath);
      try {
        const counts = importAll(db, data);
        console.log(`✓ 已从 ${arg} 恢复`);
        for (const [k, v] of Object.entries(counts))
          console.log(`  ${k}  ${v}`);
        console.log('\n向量未随备份迁移，请运行 rebuild 重算。');
      } finally {
        db.close();
      }
    } catch (error) {
      fail(error.message);
    }
  },

  async retention() {
    // 份数取自 arg（argv[3]），不是 argv[4] —— 那是 --apply 的位置。
    // 这里曾经写成 argv[4]，于是 `retention 1 --apply` 会算出
    // Number('--apply') = NaN，然后**静默地一份都不删**：
    // 命令报成功、输出「没有需要删除的备份」，而备份一直在累积。
    const keep = arg === undefined ? 5 : Number(arg);
    if (!Number.isInteger(keep) || keep < 0) {
      return fail(
        `保留份数必须是 0 或正整数（收到「${arg}」）`,
        '用法：node studio/cli.mjs retention [份数] [--apply]',
      );
    }
    const apply = process.argv.includes('--apply');
    try {
      const cfg = webdavConfigFromEnv();
      const webdav = createWebdav(cfg);
      const plan = await runRetention({
        webdav,
        dir: cfg.dir,
        keep,
        dryRun: !apply,
      });
      console.log(
        `${plan.dryRun ? '【dry-run】' : '【已执行】'}共 ${plan.total} 份，保留 ${plan.keep} 份`,
      );
      if (plan.delete.length === 0) console.log('  没有需要删除的备份。');
      for (const n of plan.delete)
        console.log(`  ${plan.dryRun ? '将删除' : '已删除'}  ${n}`);
      if (plan.dryRun && plan.delete.length) {
        console.log('\n加 --apply 才会真的删除。');
      }
    } catch (error) {
      fail(error.message);
    }
  },

  // ── 原始档案导入（ARCH-001）──
  //
  // 只读用户**明确交进来**的路径。没有 URL 导入、没有账户同步、
  // 没有自动发现 —— 验收里那句「未获确认不得抓取」在这里的落点是
  // 根本没有那个函数，而不是默认关闭。
  async archive() {
    const db = openExisting();
    if (!db) return;
    try {
      const sub = process.argv[3];

      if (sub === 'import') {
        const target = process.argv[4];
        if (!target)
          return fail(
            '需要文件或目录路径',
            'node studio/cli.mjs archive import <路径>',
          );
        if (!existsSync(target)) return fail(`路径不存在：${target}`);

        const isDir = statSync(target).isDirectory();
        const r = isDir
          ? importDirectory(db, { dir: target })
          : importFile(db, { path: target });

        console.log(`✓ 导入完成${isDir ? `（扫描 ${r.files} 个文件）` : ''}`);
        console.log(
          `  新增 ${r.imported} · 已有 ${r.deduped} · 跳过 ${r.skipped}`,
        );
        if (r.errors.length) {
          // 逐条列出来。这一层的失败方式是**静默丢失** ——
          // 只说「跳过 3 条」等于让人自己去猜是哪 3 条
          console.log(`\n  未导入（${r.errors.length} 条）：`);
          for (const e of r.errors.slice(0, 20)) console.log(`    ${e}`);
          if (r.errors.length > 20)
            console.log(`    …还有 ${r.errors.length - 20} 条`);
        }
        return;
      }

      if (sub === 'conflicts') {
        const rows = findConflicts(db);
        if (rows.length === 0) {
          console.log('没有「同一来源、内容却不同」的档案。');
          return;
        }
        console.log('同一来源存在多个版本（哪一版是最新的只有你知道）：\n');
        for (const c of rows) {
          console.log(`  ${c.source}`);
          console.log(`    ${c.versions} 个版本，${c.firstAt} → ${c.lastAt}`);
        }
        return;
      }

      if (sub === 'list') {
        const n = db
          .prepare('SELECT COUNT(*) AS c FROM archive_entries')
          .get().c;
        const sources = db
          .prepare(
            'SELECT source, COUNT(*) AS c FROM archive_entries GROUP BY source ORDER BY c DESC LIMIT 20',
          )
          .all();
        console.log(`档案共 ${n} 条，来自 ${sources.length} 个来源：\n`);
        for (const s of sources)
          console.log(`  ${String(s.c).padStart(5)}  ${s.source}`);
        return;
      }

      return fail(
        `未知子命令：${sub}`,
        '可用：import <路径> / conflicts / list',
      );
    } finally {
      db.close();
    }
  },

  // ── 受限访问身份（ACCESS-001）──

  async token() {
    const db = openExisting();
    if (!db) return;
    try {
      const sub = process.argv[3];

      if (sub === 'list' || sub === undefined) {
        const tokens = listTokens(db);
        if (tokens.length === 0) {
          console.log('还没有受限身份。');
          console.log(
            '\n新建一个：node studio/cli.mjs token new <用途> [预设]',
          );
          console.log(`预设：${Object.keys(PRESETS).join(' / ')}`);
          return;
        }
        console.log('  用途'.padEnd(24) + '能力'.padEnd(46) + '状态');
        for (const t of tokens) {
          const scopes = t.scopes.length ? t.scopes.join(',') : '（无）';
          console.log(
            '  ' +
              t.label.slice(0, 22).padEnd(22) +
              scopes.slice(0, 44).padEnd(46) +
              (t.active ? '有效' : '已撤销/过期'),
          );
        }
        console.log('\n可用能力：');
        for (const [k, v] of Object.entries(SCOPES))
          console.log(`  ${k.padEnd(16)} ${v}`);
        return;
      }

      if (sub === 'new') {
        const label = process.argv[4];
        const preset = process.argv[5] ?? 'searcher';
        if (!label)
          return fail(
            '需要用途说明',
            'node studio/cli.mjs token new <用途> [reader|searcher|drafter]',
          );
        const scopes = PRESETS[preset];
        if (!scopes)
          return fail(
            `未知预设：${preset}`,
            `可用：${Object.keys(PRESETS).join(' / ')}`,
          );

        const { token, record } = createToken(db, { label, scopes });
        console.log(`✓ 已创建受限身份「${record.label}」`);
        console.log(`  能力：${scopes.join(', ')}`);
        console.log('\n令牌（**只显示这一次**，请立刻交给使用者）：');
        console.log(`  ${token}`);
        console.log(
          '\n服务端只保存它的哈希，因此这个值再也取不回来 —— 丢了就轮换。',
        );
        return;
      }

      if (sub === 'revoke') {
        const id = process.argv[4];
        if (!id) return fail('需要令牌 id', '先跑 token list');
        console.log(revokeToken(db, id) ? '✓ 已撤销' : '✗ 没找到或已经撤销过');
        return;
      }

      if (sub === 'rotate') {
        const id = process.argv[4];
        if (!id) return fail('需要令牌 id', '先跑 token list');
        const { token, record } = rotateToken(db, id);
        console.log(`✓ 已轮换，沿用「${record.label}」与同样的能力`);
        console.log('\n新令牌（**只显示这一次**）：');
        console.log(`  ${token}`);
        return;
      }

      if (sub === 'log') {
        const rows = recentAccess(db, { limit: Number(process.argv[4] ?? 40) });
        if (rows.length === 0) {
          console.log('还没有访问记录。');
          return;
        }
        for (const r of rows) {
          // 只打印方法与路径：审计要能回答「谁碰过什么」，
          // 而查询串与响应体里可能是私人内容
          console.log(
            `  ${r.at}  ${r.allowed ? '放行' : '拒绝'}  ${(r.tokenLabel ?? '(已删)').padEnd(18)}${r.method} ${r.path}`,
          );
        }
        return;
      }

      return fail(
        `未知子命令：${sub}`,
        '可用：list / new / revoke / rotate / log',
      );
    } finally {
      db.close();
    }
  },

  async rebuild() {
    const db = openExisting();
    if (!db) return;
    try {
      const embedder = makeEmbedder();
      console.log(`正在重建向量（端点 ${embedder.baseUrl}）…`);
      const result = await rebuildEmbeddings(db, embedder);
      console.log(`✓ 已重建 ${result.rebuilt} 条（模型 ${result.model}）`);
      if (result.failed.length) {
        console.log(
          `  ${result.failed.length} 条失败：${result.failed.join(', ')}`,
        );
      }
    } catch (error) {
      fail(error.message, '确认本地推理服务已启动，且它提供 /v1/embeddings。');
    } finally {
      db.close();
    }
  },
};

if (!command || !commands[command]) {
  console.log('用法: node studio/cli.mjs <命令>\n');
  console.log('  status              显示数据规模与配置');
  console.log('  start               启动本地服务');
  console.log('  export <file>       导出全部语义数据');
  console.log('  import <file>       导入到空库');
  console.log('  backup              加密备份到 WebDAV 并回读校验');
  console.log('  restore <name>      从远端备份恢复');
  console.log(
    '  retention [n]       清理旧备份（默认 dry-run，加 --apply 执行）',
  );
  console.log(
    '  token <子命令>      受限访问身份：list / new / revoke / rotate / log',
  );
  console.log('  rebuild             重算全部向量');
  process.exitCode = command ? 1 : 0;
} else {
  await commands[command]();
}
