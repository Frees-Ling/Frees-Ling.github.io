// 备份传输层的契约（WEBDAV-001）。
//
// ── 为什么要把「四个方法」写成代码 ──
//
// `remote.mjs` 的备份编排只调用 `put` / `get` / `list` / `del` 四个方法 ——
// 这一点是**结构事实**，但它此前**没有被测试过**：所有针对
// `runBackup` / `runRetention` 的用例都走真实的 WebDAV 客户端，
// 因此「换一家传输协议要改动多少」这个问题从来没有被真正回答过。
//
// 这个区别很重要，因为还有一个已知的、悬着的前提：
//
//   123 云盘的 WebDAV **是会员功能、没有官方协议文档、限额未知**，
//   而它的专用密码很可能覆盖整个网盘 —— 也就是说
//   「三个 endpoint 用独立凭据最小权限隔离」这个架构设想
//   **在 WebDAV 上可能根本不成立**（见 docs/research/webdav-provider.md）。
//
// 一旦它不成立，就得换传输协议。那时唯一的问题是：**代价有多大？**
// 这份契约把答案变成可执行的断言：只要实现下面四个方法、语义一致，
// 编排、加密、回读校验、保留策略都不用动。
//
// ── 语义必须逐条对齐，否则「可替换」是假的 ──
//
// 光有同名方法不算数。真正会咬人的是错误语义：
// 「文件不存在」到底是返回 `null` 还是抛错？「目录不存在」呢？
// 这些地方不一致，换传输时就会以「保留策略把错误当成空列表」这种形式出事 ——
// 而空列表会被解读成「没有备份」，那是最危险的一种误判。

/** 传输层必须实现的四个方法。多一个都不行 —— 多了就不是可替换的。 */
export const TRANSPORT_METHODS = Object.freeze(['put', 'get', 'list', 'del']);

/**
 * 校验一个对象是否满足传输契约。
 *
 * 用在装配处（拿到实现的时候），而不是第一次备份的时候 ——
 * 备份通常在夜里跑，那时才发现接口不对已经太晚。
 */
export function assertTransport(transport, label = '传输层') {
  if (!transport || typeof transport !== 'object') {
    throw new Error(`${label}必须是一个对象`);
  }
  const missing = TRANSPORT_METHODS.filter(
    (m) => typeof transport[m] !== 'function',
  );
  if (missing.length > 0) {
    throw new Error(
      `${label}缺少方法：${missing.join(', ')}。` +
        `完整的传输契约是 ${TRANSPORT_METHODS.join(' / ')}。`,
    );
  }
  return transport;
}

/**
 * 用一个只放行四个方法的代理把传输层包起来。
 *
 * **这是「编排不认识具体传输协议」这句话的可执行版本。**
 * 拿它去跑 `runBackup` / `runRetention`：只要编排里出现任何第五个调用
 * （`webdav.mkcol(...)`、`.stat(...)`、`.exists(...)`），代理会立刻抛错，
 * 而不是等到换传输的那天才发现。
 *
 * 单测里用它把「可替换」钉住；生产装配不用它 ——
 * 那点开销不值得，而且代理会掩盖真实对象的调试信息。
 */
export function strictTransport(transport, label = '传输层') {
  assertTransport(transport, label);
  const allowed = new Set(TRANSPORT_METHODS);
  return new Proxy(transport, {
    get(target, prop, receiver) {
      // 符号键（Symbol.iterator、util.inspect.custom 等）一律放行：
      // 它们来自运行时与调试工具，不是编排在用新方法
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      if (!allowed.has(prop)) {
        throw new Error(
          `编排调用了传输契约之外的方法「${String(prop)}」—— ` +
            `契约只有 ${TRANSPORT_METHODS.join(' / ')}。` +
            '新增调用会让「换个传输协议就能替换」不再成立。',
        );
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
