#!/usr/bin/env node
// 知识库命令行入口。
//
//   node studio/cli.mjs start              启动本地服务
//   node studio/cli.mjs status             显示数据规模与配置
//   node studio/cli.mjs export <file>      导出全部语义数据
//   node studio/cli.mjs import <file>      导入到空库
//   node studio/cli.mjs rebuild            重算全部向量
//
// 环境变量：
//   FREES_STUDIO_HOME       数据目录，默认 ~/.frees-studio
//   FREES_STUDIO_MODEL_URL  模型端点，默认 http://127.0.0.1:1234/v1
//
// ── 为什么不打印令牌 ──
// 终端会被截图，也会进 scrollback。需要时自己去读令牌文件。

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { openDatabase, currentVersion, SCHEMA_VERSION } from './db/schema.mjs';
import { studioHome, start, loadOrCreateToken } from './server/index.mjs';
import {
  exportToFile,
  importFromFile,
  rebuildEmbeddings,
  countEntities,
} from './db/portable.mjs';
import { createEmbedder } from './ai/embeddings.mjs';

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
  console.log('  rebuild             重算全部向量');
  process.exitCode = command ? 1 : 0;
} else {
  await commands[command]();
}
