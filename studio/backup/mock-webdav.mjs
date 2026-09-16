// 内存版模拟 WebDAV 服务。
//
// 用于在没有真实 WebDAV 凭证的情况下，把上传、回读、列举、删除、
// 保留策略这些**与服务器实现无关**的逻辑做完并测透。
//
// 它**不是**一个完整的 WebDAV 实现：只支持备份用得上的四个方法，
// 且不支持锁、属性、Range。因此它验证不了「真实服务会不会接受我们的请求」——
// 那需要在拿到真实凭证后单独测。
//
// ── 用它的时候有一个坑 ──
//
// 它跑在**调用方进程的事件循环**上。若调用方用 execFileSync 之类的
// **同步**方式去跑一个会访问它的子进程，就会三方互等（子进程等响应、
// 调用方等子进程、服务器等循环空闲），永远不结束且不报任何错。
// 见 cli.test.mjs 里的 runAsync：凡是配套 HTTP 服务的用例都必须用异步调用。

import http from 'node:http';

export function createMockWebdav({
  username = 'u',
  password = 'p',
  dirs = ['/backups'],
} = {}) {
  const files = new Map(); // path -> Buffer
  const expected =
    'Basic ' +
    Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

  const server = http.createServer((req, res) => {
    const send = (status, body = '') => {
      res.writeHead(status, { 'content-type': 'application/xml' });
      res.end(body);
    };

    if (req.headers.authorization !== expected) return send(401);

    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    if (req.method === 'PUT') {
      const parent = path.replace(/\/[^/]*$/, '') || '/';
      if (!dirs.includes(parent) && parent !== '/') return send(409);
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const existed = files.has(path);
        files.set(path, Buffer.concat(chunks));
        send(existed ? 204 : 201);
      });
      return;
    }

    if (req.method === 'GET') {
      const buf = files.get(path);
      if (!buf) return send(404);
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(buf);
      return;
    }

    if (req.method === 'DELETE') {
      if (!files.delete(path)) return send(404);
      return send(204);
    }

    if (req.method === 'PROPFIND') {
      if (!dirs.includes(path)) return send(404);
      const hrefs = [...files.keys()]
        .filter((p) => p.startsWith(path.replace(/\/+$/, '') + '/'))
        .map((p) => `<d:response><d:href>${p}</d:href></d:response>`)
        .join('');
      return send(
        207,
        `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs}</d:multistatus>`,
      );
    }

    send(405);
  });

  return {
    server,
    files,
    async start() {
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${server.address().port}`;
    },
    /**
     * 关闭服务。
     *
     * **必须强制断开连接**，否则 close() 的回调可能永远不触发：
     * 客户端（undici）会保持 keep-alive 连接，而 `server.close(cb)`
     * 只在**所有**连接关闭后才回调。空闲的 socket 不会让事件循环保持活跃，
     * 于是表现为「事件循环已空，但 Promise 仍未 settle」——
     * 实测让整个测试文件挂满 10 分钟都不结束，且不报任何错。
     */
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
