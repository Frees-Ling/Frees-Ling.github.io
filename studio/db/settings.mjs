// 可配置项与 secret reference（STUDIO-003）。
//
// ── 这一层要挡住的是什么 ──
//
// 配置界面天生是密钥泄漏的高发地：用户把 WebDAV 密码粘进输入框、
// 界面把它存进库、导出备份带走、日志里再打一遍。等到发现时，
// 密钥已经在好几处留了副本，而每一处都得单独清理。
//
// 所以这里的分界线不是「加密存储」，而是**根本不存**：
//
//   · 普通配置（端点、模型名、备份目录）→ 直接存值
//   · 敏感项（密码、口令）→ 只存一个**引用**，指向环境变量或钥匙串条目
//
// 真正的值只在**用到的那一刻**去取，取完即用，不落盘、不进返回值。
// 这样即使整个库被拿走，里面也没有任何密码。
//
// ── 引用为什么比加密好 ──
//
// 加密存储要求程序手里有一把主密钥，而主密钥又得存在某处 ——
// 问题只是往上挪了一层。引用式则借用已有的保管者（钥匙串、launchd 环境），
// 程序本身**没有**可泄漏的东西。

export { SETTINGS_SCHEMA, SETTING_BY_KEY } from './settings-schema.mjs';

import { SETTINGS_SCHEMA, SETTING_BY_KEY } from './settings-schema.mjs';
import { describeKeychainRef } from '../secrets/keychain.mjs';

const SETTING_VALUE_MAX = 2048;

function now() {
  return new Date().toISOString();
}

/**
 * 校验一个 secret 引用。
 *
 * **这是这一层最重要的一条规则**：敏感槽里只接受引用对象，
 * 传字符串（哪怕长得不像密码）一律拒绝。
 *
 * 为什么连「看起来是引用」的字符串也拒绝：一旦允许字符串，
 * 「先写成明文以后再改」就永远有借口，而漏网的那一次不会被发现。
 * 只认对象，界面上就没有把明文存进来的路径。
 */
export function requireSecretRef(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      '敏感项只接受**引用**，不接受值。' +
        '请写成 { kind: "env", name: "…" } 或 ' +
        '{ kind: "keychain", service: "…", account: "…" }。' +
        '直接把密码存进库里，会让它随备份、导出和日志扩散到多处，' +
        '而那些地方都要单独清理 —— 所以这里根本不给那条路。',
    );
  }

  if (value.kind === 'env') {
    if (
      typeof value.name !== 'string' ||
      !/^[A-Z][A-Z0-9_]*$/.test(value.name)
    ) {
      throw new Error(
        '环境变量引用需要一个合法的变量名（大写字母、数字与下划线），' +
          `收到的是 ${JSON.stringify(value.name)}`,
      );
    }
    return { kind: 'env', name: value.name };
  }

  if (value.kind === 'keychain') {
    for (const field of ['service', 'account']) {
      if (typeof value[field] !== 'string' || value[field].trim() === '') {
        throw new Error(`钥匙串引用缺少 ${field}`);
      }
    }
    return {
      kind: 'keychain',
      service: value.service.trim(),
      account: value.account.trim(),
    };
  }

  throw new Error(
    `未知的引用类型 ${JSON.stringify(value.kind)} —— 只支持 env 与 keychain`,
  );
}

/** 普通配置项的值校验。 */
function requirePlainValue(key, value) {
  if (typeof value !== 'string') {
    throw new Error(`普通配置项 ${key} 只接受字符串`);
  }
  if (value.length > SETTING_VALUE_MAX) {
    throw new Error(`配置项 ${key} 过长（上限 ${SETTING_VALUE_MAX} 字符）`);
  }
  return value;
}

/**
 * 写入一项配置。
 *
 * @returns 存储后的形态：普通项是字符串，敏感项是引用对象。
 */
export function setSetting(db, key, value) {
  const def = SETTING_BY_KEY.get(key);
  if (!def) {
    // 拒绝未知键，而不是照样写进去。放任未知键会让「配置里有什么」
    // 变成一个查不清的问题，而拼错键名是最常见的误操作
    throw new Error(`未知的配置项：${key}`);
  }

  const stored =
    def.kind === 'secret'
      ? requireSecretRef(value)
      : requirePlainValue(key, value);

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(stored), now());

  return stored;
}

export function deleteSetting(db, key) {
  return db.prepare('DELETE FROM settings WHERE key = ?').run(key).changes > 0;
}

function readRaw(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = new Map();
  for (const row of rows) {
    try {
      out.set(row.key, JSON.parse(row.value));
    } catch {
      // 库里存了非法 JSON：不能静默当成「没设置」，那会让用户
      // 反复修改却毫无效果。抛出去，让人看见。
      throw new Error(`配置项 ${row.key} 的值不是合法 JSON，库可能被外部改过`);
    }
  }
  return out;
}

/**
 * 读出全部配置，**用于界面展示**。
 *
 * 敏感项**只回引用与可解析状态，绝不回值** —— 这是这一层唯一的对外出口，
 * 让它成为「值出不去」的保证点，而不是靠每个调用方自觉。
 */
export async function listSettings(db, env = process.env, describers = {}) {
  const stored = readRaw(db);
  const out = [];

  for (const def of SETTINGS_SCHEMA) {
    const raw = stored.get(def.key);
    const base = {
      key: def.key,
      kind: def.kind,
      label: def.label,
      hint: def.hint ?? null,
      env: def.env ?? null,
    };

    if (def.kind === 'secret') {
      const ref = raw ?? (def.env ? { kind: 'env', name: def.env } : null);
      // 「取不到」不是一件事：锁定了要人去解锁，没配过要人去配，
      // 访问被拒又是另一种。只给一个 available 布尔值，
      // 用户看到的永远是「不可用」，然后只能猜是哪一种。
      const { status, reason } = await describeSecret(ref, env, describers);
      out.push({
        ...base,
        // 只有引用（或 null）。**没有 value 字段** —— 不是留空，是不存在。
        ref,
        source: raw ? '设置' : def.env && env[def.env] ? '环境变量' : '未配置',
        status,
        reason,
        available: status === 'ok',
      });
      continue;
    }

    if (raw !== undefined) {
      out.push({ ...base, value: raw, source: '设置' });
      continue;
    }
    if (def.env && env[def.env] !== undefined) {
      out.push({ ...base, value: env[def.env], source: '环境变量' });
      continue;
    }
    out.push({ ...base, value: def.default ?? '', source: '默认值' });
  }

  return out;
}

/**
 * 描述一个敏感项能不能取到 —— **绝不读值**。
 *
 * 与 resolveSecret 的分工：那个负责取，这个负责说。界面、诊断、日志
 * 一律走这条，于是「显示一个密钥的状态」这条路径上不存在明文。
 */
export async function describeSecret(ref, env = process.env, describers = {}) {
  if (!ref) {
    return { status: 'unset', reason: '尚未配置来源 —— 需要先指定去哪里取' };
  }

  if (ref.kind === 'env') {
    const value = env[ref.name];
    if (typeof value !== 'string' || value === '') {
      return {
        status: 'missing',
        reason: `环境变量 ${ref.name} 没有设置或为空`,
      };
    }
    return { status: 'ok', reason: '可读取' };
  }

  if (ref.kind === 'keychain') {
    const describe = describers.keychain ?? describeKeychainRef;
    return describe(ref);
  }

  return { status: 'unavailable', reason: `未知的引用类型 ${ref.kind}` };
}

/** 取单项普通配置的生效值（普通项才走这里）。 */
export function getSetting(db, key, env = process.env) {
  const def = SETTING_BY_KEY.get(key);
  if (!def) throw new Error(`未知的配置项：${key}`);
  if (def.kind === 'secret') {
    throw new Error(
      `${key} 是敏感项，不能用 getSetting 读 —— 用 resolveSecret 在用到的地方取，` +
        '并且不要把取到的值传出去',
    );
  }
  const raw = readRaw(db).get(key);
  if (raw !== undefined) return raw;
  if (def.env && env[def.env] !== undefined) return env[def.env];
  return def.default ?? '';
}

/**
 * 解析一个 secret 引用，拿到**真正的值**。
 *
 * 这个函数的返回值是明文，所以调用点的纪律是：**取到就用，不存、不打日志、
 * 不放返回值**。为此它刻意不接收 db —— 让「解析」与「读取配置」分开，
 * 解析不会被顺手用来列举配置。
 *
 * 取不到时返回 null 而不是抛错：钥匙串锁定、环境变量没设都是常见状态，
 * 调用方要能给出「去哪配」的提示，而不是崩在深处。
 */
export function resolveSecret(ref, env = process.env, readers = {}) {
  if (!ref || typeof ref !== 'object') return null;

  if (ref.kind === 'env') {
    const value = env[ref.name];
    return typeof value === 'string' && value !== '' ? value : null;
  }

  if (ref.kind === 'keychain') {
    const reader = readers.keychain;
    if (!reader) return null;
    try {
      const value = reader(ref);
      return typeof value === 'string' && value !== '' ? value : null;
    } catch {
      // 钥匙串锁定、条目不存在、看门狗超时都走到这里。
      // 不把底层错误向上抛：它的消息里可能带条目名甚至更糟的东西，
      // 而调用方需要的只是「现在取不到」。
      return null;
    }
  }

  return null;
}
