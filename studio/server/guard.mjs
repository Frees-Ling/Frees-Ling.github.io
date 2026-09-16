// 本地服务的两道外围防线（SEC-002）。
//
// ── 为什么本地服务也需要它们 ──
//
// 「只绑 127.0.0.1」挡住的是**别的机器**，挡不住**本机上跑着的网页**。
// 用户的浏览器可以访问任意外站，而外站的脚本可以：
//
//   ① 用 DNS rebinding 让 evil.com 解析到 127.0.0.1，
//      于是浏览器认为「evil.com 和本站同源」，请求就会带着外站的意图
//      打到本地服务上，而服务端看到的 remoteAddress 确实是 127.0.0.1。
//      挡它的办法是**校验 Host 头** —— 浏览器发的是 `Host: evil.com`。
//
//   ② 无脑地反复猜令牌。令牌本身有 256 位熵，猜不中；
//      但「猜不中」不等于「不用管」—— 无限次的尝试会把日志淹没，
//      也会让将来任何一次熵不足的改动直接变成可攻破。
//
// 两道防线都不依赖令牌，因此它们在任何令牌实现下都成立。

/**
 * Host 头是否指向本机。
 *
 * 只接受回环地址的三种写法。刻意**不接受**任意域名，
 * 哪怕它当前解析到 127.0.0.1 —— DNS 是可以随时改的，
 * 「现在指向本机」不构成它可以冒充本机的理由。
 */
export function hostAllowed(hostHeader, port) {
  if (typeof hostHeader !== 'string' || hostHeader === '') {
    // 没有 Host 头的 HTTP/1.1 请求本身就不正常
    return false;
  }

  const host = hostHeader.trim().toLowerCase();
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  // 默认端口时浏览器可能省略端口号；服务端口固定，不匹配就不放行
  return allowed.includes(host);
}

/**
 * 登录失败限流。
 *
 * 只统计**失败**：成功的登录不清零，但也不计入 —— 用户自己反复登录
 * 不该把自己锁在门外。
 *
 * 时间窗是滑动式的：记下每次失败的时刻，窗口内超过上限就拒绝，
 * 窗口滑过之后自动恢复，不需要任何后台任务或持久化。
 * 进程重启即清零 —— 对这个场景足够了，且避免了「锁死状态存到磁盘上」
 * 这种更难收拾的局面。
 */
export function createLoginThrottle({ max = 10, windowMs = 60_000 } = {}) {
  const failures = new Map(); // key -> number[]（失败时刻）

  const recent = (key, now) =>
    (failures.get(key) ?? []).filter((t) => now - t < windowMs);

  return {
    /** 现在是否应当拒绝。 */
    check(key, now = Date.now()) {
      const hits = recent(key, now);
      if (hits.length === 0) failures.delete(key);
      else failures.set(key, hits);
      return hits.length < max;
    },

    /** 还要等多久（秒），用于 Retry-After。 */
    retryAfter(key, now = Date.now()) {
      const hits = recent(key, now);
      if (hits.length < max) return 0;
      // 最早那次失败滑出窗口时即可重试
      return Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    },

    recordFailure(key, now = Date.now()) {
      const hits = recent(key, now);
      hits.push(now);
      failures.set(key, hits);
    },

    recordSuccess(key) {
      failures.delete(key);
    },

    /** 仅测试用。 */
    reset() {
      failures.clear();
    },
  };
}
