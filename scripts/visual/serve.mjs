// 供视觉脚本使用的内建静态服务器。
//
// 不用 `astro preview`：它在本机是守护进程化的（有 stop/status/logs），
// spawn 之后 kill 父进程杀不掉，会留下残留服务占用端口。

import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import {
  basename,
  dirname,
  extname,
  join,
  normalize,
  resolve,
  sep,
} from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * @param {string} distDir 要服务的目录（通常是 dist/）
 * @param {number} port
 * @returns {Promise<import('node:http').Server>}
 */
export function startStaticServer(distDir, port) {
  const root = resolve(distDir);
  // 用解析过符号链接的根做比较基准，避免 dist/ 内的符号链接绕过前缀检查
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {
    /* 目录不存在时保持原值，下面的 404 分支会兜住 */
  }

  const server = createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    let filePath = resolve(root, `.${normalize(urlPath)}`);

    // 防目录穿越：解析符号链接后仍必须落在 dist/ 内。
    // 纯字符串前缀比较挡不住 dist/ 内指向外部的符号链接。
    let realPath = filePath;
    try {
      realPath = realpathSync(filePath);
    } catch {
      // 文件不存在时解析其父目录并拼回文件名，避免因 ENOENT 跳过检查
      try {
        realPath = join(realpathSync(dirname(filePath)), basename(filePath));
      } catch {
        /* 保持原值，交由下面的 404 分支处理 */
      }
    }
    // 分隔符感知的比较。单纯的 startsWith(realRoot) 会被同名前缀绕过：
    // realRoot 为 /dist 时，/dist-evil/x 也满足 startsWith('/dist')。
    const realRootWithSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
    if (realPath !== realRoot && !realPath.startsWith(realRootWithSep)) {
      res.writeHead(403);
      res.end();
      return;
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}
