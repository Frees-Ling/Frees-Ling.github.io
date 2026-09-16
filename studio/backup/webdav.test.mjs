// WebDAV 客户端的解析行为。
//
// 这里**不连服务器**：喂给 list() 一段构造好的 PROPFIND 响应，
// 断言它解析出的名字。要测的是解析规则本身，而规则该由 RFC 与服务端的
// 实际输出决定 —— 拿自己的 mock 当依据就成了自证。
//
// 下面这些 XML 片段抄自真实服务端（wsgidav 4.3.5）的实际输出。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWebdav, webdavConfigFromEnv } from './webdav.mjs';

/** 造一个只回答 PROPFIND 的假 fetch。 */
function fetchReturning(xml, { status = 207 } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => xml,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

const multistatus = (hrefs) =>
  `<?xml version="1.0" encoding="utf-8" ?>
<ns0:multistatus xmlns:ns0="DAV:">${hrefs
    .map((h) => `<ns0:response><ns0:href>${h}</ns0:href></ns0:response>`)
    .join('')}</ns0:multistatus>`;

function davWith(xml) {
  return createWebdav({
    baseUrl: 'http://127.0.0.1:8401',
    username: 'u',
    password: 'p',
    fetchImpl: fetchReturning(xml),
  });
}

test('list 解析出编码过的名字（空格、中文、emoji）', async () => {
  const dav = davWith(
    multistatus([
      '/backups/',
      '/backups/plain.freesbk',
      '/backups/with%20space.freesbk',
      '/backups/%E5%A4%87%E4%BB%BD.freesbk',
      '/backups/%F0%9F%93%A6.freesbk',
    ]),
  );
  assert.deepEqual(await dav.list('/backups'), [
    'plain.freesbk',
    'with space.freesbk',
    '备份.freesbk',
    '📦.freesbk',
  ]);
});

test('list 不截断含 # 与 ? 的文件名', async () => {
  // 这是实测在真实服务端上抓到的缺陷：href 里的 `%23` / `%3F` 若在
  // 解析成 URL 之前就被解码，就会变成 fragment / query 分隔符，
  // 于是 `hash#1.freesbk` 只剩 `hash`。而保留策略是按名字删的 ——
  // 名字被截断意味着删错文件或者删不掉。
  const dav = davWith(
    multistatus([
      '/backups/hash%231.freesbk',
      '/backups/q%3Fmark.freesbk',
      '/backups/a%23b',
      '/backups/a',
    ]),
  );
  assert.deepEqual(await dav.list('/backups'), [
    'hash#1.freesbk',
    'q?mark.freesbk',
    'a#b',
    'a',
  ]);
});

test('list 只解码一层，不把字面百分号吃掉', async () => {
  // 名字里本来就有百分号时，服务端会双重编码；只解一层才是原名字
  const dav = davWith(multistatus(['/backups/pct%2520x.freesbk']));
  assert.deepEqual(await dav.list('/backups'), ['pct%20x.freesbk']);
});

test('list 同时支持绝对路径与完整 URL 两种 href', async () => {
  const dav = davWith(
    multistatus([
      '/backups/',
      '/backups/abs.freesbk',
      'http://127.0.0.1:8401/backups/full.freesbk',
    ]),
  );
  assert.deepEqual(await dav.list('/backups'), ['abs.freesbk', 'full.freesbk']);
});

test('list 忽略目录自身与子目录，只给文件名', async () => {
  const dav = davWith(
    multistatus(['/backups/', '/backups/sub/', '/backups/x.freesbk']),
  );
  assert.deepEqual(await dav.list('/backups'), ['x.freesbk']);
});

test('list 丢弃带路径分隔符的项，只返回文件名', async () => {
  // 这条用例原先断言的是**相反**的行为（嵌套项带相对路径一起返回）。
  // 那个断言是错的：它把一个可被利用的形态固定成了「预期行为」。
  // 深度 1 的 PROPFIND 本来就不该返回带分隔符的项，
  // 而带上分隔符之后，下游（保留策略的删除路径）就能被带出目录。
  const dav = davWith(
    multistatus([
      '/backups/',
      '/backups/sub/deep.freesbk',
      '/backups/top.freesbk',
    ]),
  );
  assert.deepEqual(await dav.list('/backups'), ['top.freesbk']);
});

test('list 丢弃解码后产生的点号段与越界项', async () => {
  // `%2F` 在 URL 解析阶段不是分隔符（规范如此），因此
  // `/backups/..%2Fevil` 解析出来仍是 `/backups/..%2Fevil`，
  // 直到解码才变成 `/backups/../evil` —— 它会通过 startsWith 检查。
  // 实测确认过：放行的话保留策略会去 DELETE 一个被规范化成
  // `/evil` 的地址，**删到备份目录外面**。删除不可逆，所以宁可丢掉。
  const dav = davWith(
    multistatus([
      '/backups/',
      '/backups/..%2Fevil',
      '/backups/%2E%2E%2Fevil',
      '/backups/frees-studio-..%2F..%2Fevil',
      '/backups/%2Fetc%2Fpasswd',
      '/backups/.',
      '/backups/ok.freesbk',
    ]),
  );
  assert.deepEqual(await dav.list('/backups'), ['ok.freesbk']);
});

test('构造请求路径时拒绝点号段（第二道防线）', async () => {
  // 即便 list() 漏了，也不该真的把 `/backups/../evil` 发出去。
  // 两道防线互相独立 —— 这与 resolveStatic 的情况一样：
  // 只测其中一道被删掉是测不出来的，所以这里直接测 url() 本身。
  const dav = createWebdav({
    baseUrl: 'http://127.0.0.1:8401',
    username: 'u',
    password: 'p',
    fetchImpl: async () => {
      throw new Error('不该发出请求');
    },
  });
  for (const bad of ['/backups/../evil', '/backups/./x', '/a/../..']) {
    await assert.rejects(() => dav.put(bad, Buffer.from('x')), /拒绝构造/);
    await assert.rejects(() => dav.del(bad), /拒绝构造/);
  }
  // 正常路径不受影响
  await assert.rejects(
    () => dav.put('/backups/ok.freesbk', Buffer.from('x')),
    /不该发出请求/,
    '正常路径应当真的走到 fetch',
  );
});

test('目录不存在时返回空数组，而不是抛错', async () => {
  const dav = createWebdav({
    baseUrl: 'http://127.0.0.1:8401',
    username: 'u',
    password: 'p',
    fetchImpl: fetchReturning('', { status: 404 }),
  });
  assert.deepEqual(await dav.list('/nope'), []);
});

test('非法百分号序列不会让整次列举失败', async () => {
  const dav = davWith(multistatus(['/backups/bad%zz.freesbk']));
  // decodeURIComponent 会抛错；不能因此整次列举失败 —— 那会被保留策略
  // 解读成「没有备份」，而那是很危险的误判
  assert.deepEqual(await dav.list('/backups'), ['bad%zz.freesbk']);
});

test('上传路径逐段编码，斜杠不会被当成数据', async () => {
  const seen = [];
  const dav = createWebdav({
    baseUrl: 'http://127.0.0.1:8401',
    username: 'u',
    password: 'p',
    fetchImpl: async (url, init) => {
      seen.push({ url, method: init.method });
      return {
        ok: true,
        status: 201,
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    },
  });
  await dav.put('/backups/a b/c#d.freesbk', Buffer.from('x'));
  assert.equal(
    seen[0].url,
    'http://127.0.0.1:8401/backups/a%20b/c%23d.freesbk',
  );
});

test('配置缺失时逐项报出缺哪个，且不拿空值去连', () => {
  assert.throws(() => webdavConfigFromEnv({}), /FREES_WEBDAV_URL/);
  assert.throws(
    () => webdavConfigFromEnv({ FREES_WEBDAV_URL: 'http://x' }),
    /FREES_WEBDAV_USER.*FREES_WEBDAV_PASSWORD|FREES_WEBDAV_PASSWORD/,
  );
  const cfg = webdavConfigFromEnv({
    FREES_WEBDAV_URL: 'http://x/',
    FREES_WEBDAV_USER: 'u',
    FREES_WEBDAV_PASSWORD: 'p',
  });
  assert.equal(cfg.baseUrl, 'http://x', '尾部斜杠应被去掉');
  assert.equal(cfg.dir, '/backups', '未指定目录时给默认值');
});
