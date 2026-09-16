// 知识库本地服务（K1）。
//
// 只绑 127.0.0.1，用随机 token 鉴权。**不提供任何对公网开放的开关** ——
// 不是「默认关闭」，而是根本不存在那条代码路径。
//
// 私人数据从不离开本机（docs/knowledge-base.md 的架构决定）。
//
// 启动：
//   node studio/server/index.mjs
// 环境变量：
//   FREES_STUDIO_HOME  数据目录，默认 ~/.frees-studio
//   FREES_STUDIO_PORT  端口，默认 4319（仅 127.0.0.1）

import http from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { openDatabase } from '../db/schema.mjs';
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  searchNotes,
  setNoteTags,
  importArchiveEntry,
  proposeMemory,
  reviewMemory,
  listApprovedMemories,
  listPendingMemories,
} from '../db/store.mjs';

import { handleRequest } from './routes.mjs';
import { createProvider } from '../ai/provider.mjs';

export const DEFAULT_PORT = 4319;
export const BIND_HOST = '127.0.0.1'; // 刻意不允许改成 0.0.0.0

/** 数据目录。默认在用户主目录下，**不放仓库内** —— 见架构文档第五节。 */
export function studioHome() {
  return process.env.FREES_STUDIO_HOME || join(homedir(), '.frees-studio');
}

/**
 * 读取或初始化访问令牌。
 *
 * 没有「默认密码」这回事：文件不存在就生成一个 32 字节随机值。
 * 权限 600 —— 同机其他用户读不到。
 */
export function loadOrCreateToken(home = studioHome()) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const tokenPath = join(home, 'token');

  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, 'utf8').trim();
    if (token) return token;
  }

  const token = randomBytes(32).toString('base64url');
  writeFileSync(tokenPath, token + '\n', { mode: 0o600 });
  return token;
}

/** 恒定时间比较，避免用响应时间侧信道猜 token。 */
export function tokenMatches(expected, provided) {
  if (typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createServer({
  db,
  token,
  home,
  provider = null,
  embedder = null,
}) {
  const deps = {
    db,
    token,
    home,
    provider,
    embedder,
    store: {
      createNote,
      getNote,
      updateNote,
      deleteNote,
      listNotes,
      searchNotes,
      setNoteTags,
      importArchiveEntry,
      proposeMemory,
      reviewMemory,
      listApprovedMemories,
      listPendingMemories,
    },
  };

  return http.createServer((req, res) => {
    // 只接受来自本机的连接。即便监听地址已被改错，这里仍是第二道闸。
    const remote = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: '只接受本机连接' }));
      return;
    }

    handleRequest(req, res, deps).catch((error) => {
      // 不回显堆栈 —— 它可能包含文件路径与内部状态
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: '内部错误', kind: error.name }));
    });
  });
}

/** 启动服务。返回 { server, port, token }，供测试与 CLI 使用。 */
export async function start({
  home = studioHome(),
  provider,
  port = Number(process.env.FREES_STUDIO_PORT || DEFAULT_PORT),
  dbPath,
} = {}) {
  const token = loadOrCreateToken(home);
  const db = openDatabase(dbPath || join(home, 'studio.db'));

  // 未显式传入 provider 时，默认指向本机常见的 LM Studio 端口。
  // **不假设它一定在运行** —— 端点不可达时对话路由会给出可操作的提示
  // （见 chat.mjs），而不是静默失败。
  const activeProvider =
    provider === undefined
      ? createProvider({
          baseUrl:
            process.env.FREES_STUDIO_MODEL_URL || 'http://127.0.0.1:1234/v1',
          model: process.env.FREES_STUDIO_MODEL || 'local-model',
        })
      : provider;

  const server = createServer({ db, token, home, provider: activeProvider });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, BIND_HOST, resolve);
  });

  return {
    server,
    db,
    token,
    provider: activeProvider,
    port: server.address().port,
  };
}

// 作为脚本直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  const { port, token, home } = await start();
  // 刻意不打印 token —— 终端会被截图，也会进 scrollback。
  // 需要时从数据目录读：cat ~/.frees-studio/token
  console.log(`知识库服务已启动: http://${BIND_HOST}:${port}`);
  console.log(`数据目录: ${home}`);
  console.log(`令牌文件: ${join(home, 'token')}（权限 600，不在终端显示）`);
}
