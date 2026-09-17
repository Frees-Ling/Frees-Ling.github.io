// 界面托管与会话认证。
//
// ── 为什么需要会话 cookie ──
//
// API 用 Bearer 令牌鉴权，但浏览器没法自己读 ~/.frees-studio/token。
// 常见的偷懒做法是把令牌放进 URL（?t=...），代价是它会进入浏览器历史、
// 可能被 Referer 带出去、也会出现在截图里。
//
// 这里改为：用户在登录页粘贴一次令牌，服务端校验后用 HttpOnly Cookie 建立会话。
//   · HttpOnly  —— 页面脚本读不到它，XSS 拿不走
//   · SameSite=Strict —— 跨站请求不会带上它，免 CSRF
//   · 不设 Domain —— 只对 127.0.0.1 这个 host 有效
// Cookie 里存的就是令牌本身，因此服务端无需维护会话表，重启即失效重登。

import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 界面文件随代码走，不放数据目录 —— 它是程序的一部分，不是用户数据。 */
export const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'web',
);
/** 项目的 tokens.css —— 界面与公开站共用同一套设计变量，不复制一份。 */
export const TOKENS_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'styles',
  'tokens.css',
);

/**
 * 项目的 prose.css —— **预览必须用它，不能另写一份**。
 *
 * 预览的全部意义是「看到什么就发布什么」。若 Studio 侧自己写一套正文样式，
 * 两边迟早不一致，而那种不一致只有在稿子发出去之后才会被发现
 * （RENDER-001 第四节：预览漂移是编辑器最昂贵的缺陷）。
 */
export const PROSE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'styles',
  'prose.css',
);
import { tokenMatches } from './index.mjs';

const COOKIE_NAME = 'frees_studio';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/** 从 Cookie 头里取出会话令牌。 */
export function sessionToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE_NAME) return decodeURIComponent(v.join('='));
  }
  return '';
}

/** 请求是否已通过会话认证。 */
export function hasSession(req, token) {
  return tokenMatches(token, sessionToken(req));
}

/**
 * 解析静态文件路径，**拒绝越界**。
 *
 * 用户可控的路径必须规范化后再确认仍在允许的根目录内 ——
 * `../../etc/passwd` 这类写法靠字符串拼接是挡不住的。
 */
export function resolveStatic(root, urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  const full = join(root, rel);
  if (!full.startsWith(root)) return null;
  if (!existsSync(full)) return null;
  return full;
}

export function serveFile(res, file) {
  const type = MIME[extname(file)] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    // 本地工具，禁用缓存以免改了界面还要手动刷新
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
}

export const LOGIN_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>书房 · 登录</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f8fafc; color: #1e293b;
    font: 15px/1.7 -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }
  @media (prefers-color-scheme: dark) { body { background: #0f172a; color: #e2e8f0; } }
  form { width: min(92vw, 380px); padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
  @media (prefers-color-scheme: dark) { form { border-color: #334155; background: #1e293b; } }
  h1 { margin: 0 0 6px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 18px; color: #64748b; font-size: 13px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font: inherit; }
  @media (prefers-color-scheme: dark) { input { border-color: #334155; background: #0f172a; color: #e2e8f0; } }
  button { width: 100%; margin-top: 12px; padding: 10px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; font: inherit; cursor: pointer; }
  code { padding: 2px 5px; border-radius: 4px; background: #f1f5f9; font-size: 12px; }
  @media (prefers-color-scheme: dark) { code { background: #0f172a; } }
  .err { color: #c4342a; font-size: 13px; min-height: 1.4em; margin-top: 10px; }
</style></head>
<body>
<form method="post" action="/api/session">
  <h1>书房</h1>
  <p>把 <code>~/.frees-studio/token</code> 的内容粘贴到下面。只需一次。</p>
  <label for="t" style="position:absolute;left:-9999px">访问令牌</label>
  <input id="t" name="token" type="password" autocomplete="off" required autofocus>
  <button type="submit">进入</button>
  <p class="err">%ERROR%</p>
</form>
</body></html>`;
