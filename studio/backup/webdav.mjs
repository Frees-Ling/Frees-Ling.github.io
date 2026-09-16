// 最小 WebDAV 客户端（KB-011）。
//
// 只实现备份需要的四个方法，不追求完整的 WebDAV 支持：
// PUT / GET / DELETE / PROPFIND。够用即可，多余的能力只会扩大攻击面。
//
// ── 凭证 ──
//
// 只从调用方传入（通常来自环境变量）。**不进日志、不进 argv、不落盘。**
// 这与备份加密的理由一致：备份的意义在于「文件泄露也没关系」，
// 而把 WebDAV 密码写在配置文件里会把这个意义抵消掉。

/** 从环境变量读取 WebDAV 配置。缺失时明确报错，而不是用空值去连。 */
export function webdavConfigFromEnv(env = process.env) {
  const baseUrl = env.FREES_WEBDAV_URL;
  const username = env.FREES_WEBDAV_USER;
  const password = env.FREES_WEBDAV_PASSWORD;
  const dir = env.FREES_WEBDAV_BACKUP_DIR || '/backups';

  const missing = [
    ['FREES_WEBDAV_URL', baseUrl],
    ['FREES_WEBDAV_USER', username],
    ['FREES_WEBDAV_PASSWORD', password],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `缺少 WebDAV 配置：${missing.join(', ')}。` +
        '这些值应通过环境变量提供，不要写进文件或命令行参数。',
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), username, password, dir };
}

export function createWebdav({
  baseUrl,
  username,
  password,
  fetchImpl = globalThis.fetch,
}) {
  const auth =
    'Basic ' +
    Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

  const url = (path) =>
    `${baseUrl}${path.split('/').map(encodeURIComponent).join('/')}`;

  async function request(method, path, { body, headers = {} } = {}) {
    const res = await fetchImpl(url(path), {
      method,
      headers: { authorization: auth, ...headers },
      body,
      // 与模型适配层同样的理由：只校验了初始 URL，
      // 跟随重定向会把凭证与内容带到未经校验的地址
      redirect: 'error',
    });
    return res;
  }

  return {
    /**
     * 上传。
     *
     * **不做自动建目录**（MKCOL）—— 备份目录应由人在服务端配好，
     * 让程序自动创建目录意味着路径写错时会静默地在错误位置建一堆目录。
     * 目录不存在时给出明确错误。
     */
    async put(path, buffer) {
      const res = await request('PUT', path, {
        body: buffer,
        headers: { 'content-type': 'application/octet-stream' },
      });
      if (res.status === 409) {
        throw new Error(`远端目录不存在：${path}。请先在服务端创建备份目录。`);
      }
      if (![200, 201, 204].includes(res.status)) {
        // 不回传响应体：它可能含服务端内部信息
        throw new Error(`上传失败（HTTP ${res.status}）`);
      }
      return { status: res.status };
    },

    async get(path) {
      const res = await request('GET', path);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
      return Buffer.from(await res.arrayBuffer());
    },

    async del(path) {
      const res = await request('DELETE', path);
      if (res.status === 404) return false;
      if (![200, 204].includes(res.status)) {
        throw new Error(`删除失败（HTTP ${res.status}）`);
      }
      return true;
    },

    /** 列举目录下的文件名（不含路径）。 */
    async list(dirPath) {
      const res = await request('PROPFIND', dirPath, {
        headers: { depth: '1', 'content-type': 'application/xml' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`列举失败（HTTP ${res.status}）`);

      const xml = await res.text();
      // RFC 4918 允许 href 是**绝对路径**（/backups/x）或**完整 URL**
      // （http://host/backups/x），真实服务两种都有。
      // 只认其中一种会让列举在某些服务上静默返回空 —— 而空列表会被
      // 保留策略解读成「没有备份」，那是很危险的误判。
      const dirPrefix = dirPath.replace(/\/+$/, '') + '/';
      return (
        [...xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi)]
          // ── 顺序很重要：**先解析成路径，再解码** ──
          //
          // 反过来做会静默截断文件名。href 是编码过的（`hash%231.freesbk`），
          // 若先解码再交给 `new URL()`，`#` 就被当成 fragment 分隔符、
          // `?` 被当成 query 分隔符 —— 于是
          //   `/backups/hash%231.freesbk` → 解码 → `/backups/hash#1.freesbk`
          //   → `new URL(...).pathname` → `/backups/hash`
          // 名字里 `#` 之后的部分**无声地没了**。实测在真实服务端上跑出来
          // 才发现：`hash#1.freesbk` 与 `q?mark.freesbk` 分别变成 `hash` 与 `q`。
          //
          // 这在备份场景里是会出事的：保留策略按名字删除，两个
          // `a#1` / `a#2` 会双双报成 `a`，于是删错文件或删不掉。
          .map((m) => {
            const raw = m[1];
            try {
              return new URL(raw, baseUrl).pathname;
            } catch {
              return raw;
            }
          })
          .map((pathname) => {
            // 解码放在解析之后；非法百分号序列不能让整次列举失败
            try {
              return decodeURIComponent(pathname);
            } catch {
              return pathname;
            }
          })
          .filter((p) => p.startsWith(dirPrefix) && p !== dirPrefix)
          .map((p) => p.slice(dirPrefix.length))
          .filter((name) => name && !name.endsWith('/'))
      );
    },
  };
}
