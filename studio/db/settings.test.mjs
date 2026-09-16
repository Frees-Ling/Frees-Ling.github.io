// 配置与 secret reference 测试（STUDIO-003）。
//
// 这一层的价值几乎全在「不该发生的事没发生」上：
// 明文没被存进库、值没从读取接口漏出去、拼错的键没被静默接受。
// 所以用例也照着这个方向写 —— 断言拒绝，而不只是断言成功。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from './schema.mjs';
import {
  setSetting,
  getSetting,
  deleteSetting,
  listSettings,
  requireSecretRef,
  resolveSecret,
  SETTINGS_SCHEMA,
} from './settings.mjs';
import { createNote } from './store.mjs';

const fresh = () => openDatabase(':memory:');

// ── 普通配置 ──

test('普通配置写入后读回', async () => {
  const db = fresh();
  setSetting(db, 'model.name', 'qwen2.5-7b-instruct');
  assert.equal(getSetting(db, 'model.name'), 'qwen2.5-7b-instruct');
  db.close();
});

test('未设置时回落：设置 > 环境变量 > 默认值，并且标明来源', async () => {
  const db = fresh();
  const env = { FREES_STUDIO_MODEL: '来自环境变量' };

  // 只有默认值
  assert.equal(getSetting(db, 'model.name', {}), 'local-model');

  // 环境变量盖过默认值
  assert.equal(getSetting(db, 'model.name', env), '来自环境变量');

  // 设置盖过环境变量
  setSetting(db, 'model.name', '来自设置');
  assert.equal(getSetting(db, 'model.name', env), '来自设置');

  const listed = (await listSettings(db, env)).find(
    (s) => s.key === 'model.name',
  );
  assert.equal(
    listed.source,
    '设置',
    '来源要说清楚，否则用户改了没生效会一头雾水',
  );
  db.close();
});

test('未知配置键被拒绝，而不是照样写进去', async () => {
  const db = fresh();
  assert.throws(() => setSetting(db, 'model.ur1', 'x'), /未知的配置项/);
  db.close();
});

test('普通配置项不接受非字符串', () => {
  const db = fresh();
  assert.throws(() => setSetting(db, 'model.name', 42), /只接受字符串/);
  assert.throws(() => setSetting(db, 'model.name', { a: 1 }), /只接受字符串/);
  db.close();
});

test('超长值被拒绝', () => {
  const db = fresh();
  assert.throws(() => setSetting(db, 'model.name', 'x'.repeat(3000)), /过长/);
  db.close();
});

// ── 敏感项：只存引用 ──

test('敏感项拒绝明文值（这是这一层最要紧的一条）', () => {
  const db = fresh();
  for (const plaintext of [
    'hunter2',
    'correct horse battery staple',
    '',
    'FREES_WEBDAV_PASSWORD', // 长得像引用名，仍然是字符串
  ]) {
    assert.throws(
      () => setSetting(db, 'webdav.password', plaintext),
      /只接受\*\*引用\*\*|只接受引用/,
      `明文 ${JSON.stringify(plaintext)} 必须被拒绝`,
    );
  }
  // 数字、数组、null 同样拒绝
  for (const bad of [42, ['a'], null]) {
    assert.throws(() => setSetting(db, 'webdav.password', bad));
  }
  db.close();
});

test('敏感项接受合法引用，并且存的就是引用本身', () => {
  const db = fresh();
  const ref = { kind: 'env', name: 'FREES_WEBDAV_PASSWORD' };
  assert.deepEqual(setSetting(db, 'webdav.password', ref), ref);

  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('webdav.password');
  assert.deepEqual(JSON.parse(row.value), ref, '库里应当只有引用');
  db.close();
});

test('钥匙串引用需要 service 与 account', () => {
  assert.deepEqual(
    requireSecretRef({ kind: 'keychain', service: 'svc', account: 'me' }),
    { kind: 'keychain', service: 'svc', account: 'me' },
  );
  assert.throws(
    () => requireSecretRef({ kind: 'keychain', service: 'svc' }),
    /account/,
  );
  assert.throws(
    () => requireSecretRef({ kind: 'keychain', service: '  ', account: 'me' }),
    /service/,
  );
});

test('不合法的环境变量名被拒绝', () => {
  for (const name of ['lower_case', '1LEADING_DIGIT', 'with-dash', '']) {
    assert.throws(
      () => requireSecretRef({ kind: 'env', name }),
      /合法的变量名/,
      `${name} 不该被接受`,
    );
  }
});

test('未知引用类型被拒绝', () => {
  assert.throws(
    () => requireSecretRef({ kind: 'file', path: '/x' }),
    /未知的引用类型/,
  );
  assert.throws(() => requireSecretRef({ kind: 'plain' }), /未知的引用类型/);
});

test('敏感项不能用 getSetting 读', () => {
  const db = fresh();
  assert.throws(() => getSetting(db, 'backup.passphrase'), /敏感项/);
  db.close();
});

// ── 值不许从读取接口出去 ──

test('listSettings 的返回里没有敏感值，结构上就没有那个字段', async () => {
  const db = fresh();
  setSetting(db, 'webdav.password', {
    kind: 'env',
    name: 'FREES_TEST_WEBDAV_PW',
  });
  const listed = await listSettings(db, {
    FREES_TEST_WEBDAV_PW: 'SENTINEL-VALUE',
  });

  for (const item of listed.filter((s) => s.kind === 'secret')) {
    assert.equal(
      Object.hasOwn(item, 'value'),
      false,
      `${item.key} 的返回里出现了 value 字段 —— 那正是要避免的`,
    );
    assert.equal(item.ref.kind, 'env');
  }

  // 只给其中一项配了环境变量：配了的那项要报 available，
  // 没配的那项要报不可用 —— 两个方向都断言，否则「永远返回 true」也能过
  const configured = listed.find((s) => s.key === 'webdav.password');
  const notConfigured = listed.find((s) => s.key === 'backup.passphrase');
  assert.equal(
    configured.available,
    true,
    '应报告「取得到」，但不报告值是什么',
  );
  assert.equal(notConfigured.available, false, '没配的来源必须报不可用');
  // 整个响应序列化后也不能带出值
  assert.ok(
    !JSON.stringify(listed).includes('SENTINEL-VALUE'),
    '序列化后的配置列表里出现了明文',
  );
  db.close();
});

test('引用取不到时 available 为 false，但不抛错', async () => {
  const db = fresh();
  setSetting(db, 'webdav.password', {
    kind: 'env',
    name: 'FREES_DEFINITELY_NOT_SET',
  });
  const item = (await listSettings(db, {})).find(
    (s) => s.key === 'webdav.password',
  );
  assert.equal(item.available, false);
  assert.equal(item.source, '设置');
  db.close();
});

// ── 解析 ──

test('resolveSecret 解析环境变量引用', async () => {
  assert.equal(resolveSecret({ kind: 'env', name: 'X' }, { X: 'v' }), 'v');
  assert.equal(
    resolveSecret({ kind: 'env', name: 'X' }, {}),
    null,
    '没设时给 null 而不是空串',
  );
  assert.equal(
    resolveSecret({ kind: 'env', name: 'X' }, { X: '' }),
    null,
    '空串视为没设',
  );
});

test('钥匙串取不到时返回 null，不把底层错误抛出去', () => {
  const boom = () => {
    throw new Error(
      'security: SecKeychainSearchCopyNext: The specified item could not be found',
    );
  };
  assert.equal(
    resolveSecret(
      { kind: 'keychain', service: 's', account: 'a' },
      {},
      { keychain: boom },
    ),
    null,
  );
  assert.equal(
    resolveSecret(
      { kind: 'keychain', service: 's', account: 'a' },
      {},
      {
        keychain: () => 'ok',
      },
    ),
    'ok',
  );
  // 没给 reader 时也不能崩
  assert.equal(
    resolveSecret({ kind: 'keychain', service: 's', account: 'a' }, {}),
    null,
  );
});

test('resolveSecret 对畸形输入不抛错', () => {
  for (const bad of [null, undefined, 'string', 42, {}, { kind: 'nope' }]) {
    assert.equal(resolveSecret(bad), null);
  }
});

test('删除配置项后回落到环境变量或默认值', () => {
  const db = fresh();
  setSetting(db, 'model.name', 'x');
  assert.equal(deleteSetting(db, 'model.name'), true);
  assert.equal(getSetting(db, 'model.name', {}), 'local-model');
  assert.equal(deleteSetting(db, 'model.name'), false);
  db.close();
});

// ── 泄漏扫描：这一条是验收里明写的那句 ──

/** 把目录下所有文件的内容拼起来，用于扫描。 */
function readAllFiles(dir) {
  let blob = '';
  const walk = (cur) => {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (statSync(full).isFile()) blob += readFileSync(full, 'latin1');
    }
  };
  walk(dir);
  return blob;
}

test('哨兵密钥不会落进库文件或数据目录', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leak-'));
  try {
    // 哨兵：随机串，不可能碰巧出现
    const sentinel = `SENTINEL${randomBytes(12).toString('hex')}`;
    const env = {
      FREES_WEBDAV_PASSWORD: sentinel,
      FREES_BACKUP_PASSPHRASE: sentinel,
    };

    const db = openDatabase(join(dir, 'studio.db'));

    // 走一遍真实路径：存引用、列配置、取出来用、写点别的数据
    setSetting(db, 'webdav.password', {
      kind: 'env',
      name: 'FREES_WEBDAV_PASSWORD',
    });
    setSetting(db, 'backup.passphrase', {
      kind: 'env',
      name: 'FREES_BACKUP_PASSPHRASE',
    });
    createNote(db, { title: '一篇笔记', body: '正文', tags: ['标签'] });

    const listed = await listSettings(db, env);
    assert.ok(!JSON.stringify(listed).includes(sentinel), '配置列表泄漏了密钥');

    const resolved = resolveSecret(
      listed.find((s) => s.key === 'webdav.password').ref,
      env,
    );
    assert.equal(
      resolved,
      sentinel,
      '解析应当拿到真正的值（否则这个测试是空的）',
    );

    db.close();

    const blob = readAllFiles(dir);
    assert.ok(
      !blob.includes(sentinel),
      '数据目录里出现了明文密钥 —— 备份、导出都会把它带走',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('每个敏感项都配了环境变量来源，否则界面上会无从配置', () => {
  for (const def of SETTINGS_SCHEMA.filter((d) => d.kind === 'secret')) {
    assert.ok(def.env, `${def.key} 没有 env —— 未在界面设置时就没有默认来源`);
    assert.match(def.env, /^[A-Z][A-Z0-9_]*$/);
  }
});

test('每个配置项都有标签与唯一键', () => {
  const keys = new Set();
  for (const def of SETTINGS_SCHEMA) {
    assert.ok(def.label, `${def.key} 缺少 label，界面上会显示成空行`);
    assert.ok(!keys.has(def.key), `${def.key} 重复声明`);
    keys.add(def.key);
    assert.ok(
      ['plain', 'secret'].includes(def.kind),
      `${def.key} 的 kind 不合法`,
    );
  }
});
