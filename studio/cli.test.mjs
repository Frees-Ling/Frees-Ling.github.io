// CLI 测试。
//
// 用子进程跑真实的命令行入口，而不是直接调函数 ——
// CLI 的价值就在参数解析、退出码、输出这些「外壳」上，
// 只测函数等于把它最容易被写错的部分跳过去了。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMockWebdav } from './backup/mock-webdav.mjs';
import { decrypt } from './backup/crypto.mjs';
import { openDatabase } from './db/schema.mjs';
import { createNote, proposeMemory, reviewMemory } from './db/store.mjs';
import { exportAll } from './db/portable.mjs';
import { loadOrCreateToken } from './server/index.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));

/** 跑 CLI，返回 { stdout, stderr, code }。 */
function run(args, home, env = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, FREES_STUDIO_HOME: home, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error) {
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
      code: error.status ?? 1,
    };
  }
}

/** 在临时目录里建一个有数据的库。 */
function seedHome() {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  // 令牌文件也要建：正常流程里由服务启动时生成，
  // 这里直接建库就绕过了那一步，会让「不打印令牌」那条测试无从比对
  loadOrCreateToken(home);
  const db = openDatabase(join(home, 'studio.db'));
  createNote(db, {
    title: '注意力机制笔记',
    body: '几何直觉',
    tags: ['机器学习'],
  });
  const m = proposeMemory(db, { content: '先看几何直觉' });
  reviewMemory(db, m.id, 'approved');
  proposeMemory(db, { content: '待审核的推测' });
  db.close();
  return home;
}

test('无参数时打印用法且退出码为 0', () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  try {
    const r = run([], home);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /用法/);
    assert.match(r.stdout, /export/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('未知命令退出码非零', () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  try {
    assert.equal(run(['nonsense'], home).code, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('status 在库未创建时说明情况而不是报错', () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  try {
    const r = run(['status'], home);
    assert.equal(r.code, 0, '未建库是正常状态，不该算失败');
    assert.match(r.stdout, /尚未创建/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('status 不打印令牌', () => {
  const home = seedHome();
  try {
    const token = readFileSync(join(home, 'token'), 'utf8').trim();
    const r = run(['status'], home);
    assert.equal(r.code, 0);
    assert.ok(!r.stdout.includes(token), '输出里不得含令牌内容');
    assert.match(r.stdout, /令牌文件/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('status 显示三层数量与待审核数', () => {
  const home = seedHome();
  try {
    const out = run(['status'], home).stdout;
    assert.match(out, /笔记\s+1/);
    assert.match(out, /1 已确认 \/ 1 待审核/);
    assert.match(out, /schema\s+版本/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('export 写出文件且不含向量', () => {
  const home = seedHome();
  const dir = mkdtempSync(join(tmpdir(), 'cli-out-'));
  try {
    const file = join(dir, 'backup.json');
    const r = run(['export', file], home);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /已导出/);
    assert.ok(existsSync(file));

    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /"vector"/);
    const data = JSON.parse(text);
    assert.equal(data.notes.length, 1);
    assert.equal(data.memories.length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('export 拒绝覆盖已存在的文件', () => {
  const home = seedHome();
  const dir = mkdtempSync(join(tmpdir(), 'cli-out-'));
  try {
    const file = join(dir, 'backup.json');
    writeFileSync(file, '上一份备份的内容');
    const r = run(['export', file], home);
    assert.equal(r.code, 1, '覆盖备份必须失败');
    assert.match(r.stderr, /已存在/);
    assert.equal(
      readFileSync(file, 'utf8'),
      '上一份备份的内容',
      '旧备份必须原封不动',
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('export 缺参数时给出用法提示', () => {
  const home = seedHome();
  try {
    const r = run(['export'], home);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /需要指定导出文件路径/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('export 在库不存在时提示先启动', () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  const dir = mkdtempSync(join(tmpdir(), 'cli-out-'));
  try {
    const r = run(['export', join(dir, 'x.json')], home);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /还没有库/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('import 到空库成功，到非空库失败', () => {
  const src = seedHome();
  const dir = mkdtempSync(join(tmpdir(), 'cli-out-'));
  const dst = mkdtempSync(join(tmpdir(), 'cli-'));
  try {
    const file = join(dir, 'backup.json');
    run(['export', file], src);

    const first = run(['import', file], dst);
    assert.equal(first.code, 0);
    assert.match(first.stdout, /导入/);
    assert.match(first.stdout, /rebuild/, '应提醒向量需重算');

    const second = run(['import', file], dst);
    assert.equal(second.code, 1, '非空库导入必须失败');
  } finally {
    for (const d of [src, dir, dst])
      rmSync(d, { recursive: true, force: true });
  }
});

test('import 文件不存在时明确报错', () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  try {
    const r = run(['import', '/nope/missing.json'], home);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /文件不存在/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('rebuild 在端点不可用时给出可操作提示', () => {
  const home = seedHome();
  try {
    const r = run(['rebuild'], home, {
      FREES_STUDIO_MODEL_URL: 'http://127.0.0.1:9/v1',
    });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /确认本地推理服务已启动/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('rebuild 在库不存在时提示先启动', () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  try {
    const r = run(['rebuild'], home);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /还没有库/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('import 到全新的、尚不存在的数据目录', () => {
  // 这是最常见的用法：新机器上从备份恢复。
  // 此前测试总是先建目录，恰好绕过了这条路径 ——
  // 实测发现它会以 SQLite 的 "unable to open database file" 失败。
  const src = seedHome();
  const dir = mkdtempSync(join(tmpdir(), 'cli-out-'));
  const parent = mkdtempSync(join(tmpdir(), 'cli-parent-'));
  const fresh = join(parent, 'brand-new-home'); // 刻意不创建
  try {
    const file = join(dir, 'backup.json');
    run(['export', file], src);

    assert.ok(!existsSync(fresh), '前置条件：目录不应存在');
    const r = run(['import', file], fresh);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(fresh, 'studio.db')), '应自动建好数据目录与库');

    const status = run(['status'], fresh);
    assert.match(status.stdout, /笔记\s+1/);
  } finally {
    for (const d of [src, dir, parent])
      rmSync(d, { recursive: true, force: true });
  }
});

/**
 * 异步版 CLI 调用。
 *
 * **凡是用例里跑了 HTTP 服务，就必须用这个而不是 run()。**
 * 原因不是风格：内存版 WebDAV 跑在**测试进程自己的事件循环**上，
 * 而 execFileSync 会把那个循环整个阻塞住 —— 于是 CLI 等 HTTP 响应、
 * 测试等 CLI 退出、服务器等循环空闲，三方互等，永远不结束，
 * 而且不报任何错（事件循环被阻塞时连 --test-timeout 都触发不了）。
 * 实测：整个测试文件挂满 10 分钟仍无任何输出。
 */
function runAsync(args, home, env = {}) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [CLI, ...args],
      {
        encoding: 'utf8',
        env: { ...process.env, FREES_STUDIO_HOME: home, ...env },
      },
      (error, stdout, stderr) => {
        // 退出码从 error.code 取：execFile 在非零退出时把 code 放在 error 上，
        // 直接读 error.status 在信号终止的情况下是 null
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: error ? (error.code ?? 1) : 0,
        });
      },
    );
  });
}

// ── 备份 / 恢复 / 保留策略（KB-011）──
//
// 这些用例跑**真实的 CLI 子进程 + 真实的 HTTP**（内存版 WebDAV）。
// 只测函数不够：口令会不会漏进 stdout、退出码对不对、
// dry-run 是不是真的没删东西 —— 全都只在「外壳」这一层才看得见。

const PASSPHRASE = 'correct horse battery staple';

/** 起一个内存 WebDAV。 */
async function withWebdav(dirs = ['/backups']) {
  const mock = createMockWebdav({
    username: 'frees',
    password: 'secret-pw',
    dirs,
  });
  const url = await mock.start();
  return { url, files: mock.files, close: () => mock.close() };
}

function webdavEnv(url, extra = {}) {
  return {
    FREES_WEBDAV_URL: url,
    FREES_WEBDAV_USER: 'frees',
    FREES_WEBDAV_PASSWORD: 'secret-pw',
    FREES_WEBDAV_BACKUP_DIR: '/backups',
    ...extra,
  };
}

test('backup 未设口令时拒绝执行，并说明该从哪来', async () => {
  const home = seedHome();
  try {
    const r = await runAsync(['backup'], home);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /FREES_BACKUP_PASSPHRASE/);
    // 「备份的意义在于文件泄露也没关系」—— 所以口令绝不能出现在命令行参数里。
    // 这条断言防的是将来有人为了图方便加个 --passphrase 选项
    assert.match(r.stderr, /不要写进文件或命令行参数/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('backup 缺 WebDAV 配置时逐项列出缺哪个', async () => {
  const home = seedHome();
  try {
    const r = await runAsync(['backup'], home, {
      FREES_BACKUP_PASSPHRASE: PASSPHRASE,
    });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /FREES_WEBDAV_URL/);
    assert.match(r.stderr, /FREES_WEBDAV_PASSWORD/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('backup 端到端：上传的文件能解密且内容与源库一致', async () => {
  const home = seedHome();
  const dav = await withWebdav();
  try {
    const r = await runAsync(
      ['backup'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /回读校验通过/);

    // 直连内存服务取出密文 —— 这才叫「上传成功」，
    // 而不是「本地算出来觉得成功」
    const names = [...dav.files.keys()];
    assert.equal(names.length, 1);
    assert.match(names[0], /^\/backups\/frees-studio-.*\.freesbk$/);

    const plain = decrypt(dav.files.get(names[0]), PASSPHRASE).toString('utf8');
    const data = JSON.parse(plain);
    assert.equal(data.notes.length, 1);
    assert.equal(data.memories.length, 2);
    // 向量是派生数据，不该进备份（体积大数倍，且换模型即作废）
    assert.doesNotMatch(plain, /"vector"/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});

test('backup 的输出里不含口令与 WebDAV 密码', async () => {
  const home = seedHome();
  const dav = await withWebdav();
  try {
    const r = await runAsync(
      ['backup'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.ok(!r.stdout.includes(PASSPHRASE), 'stdout 泄漏了口令');
    assert.ok(!r.stderr.includes(PASSPHRASE), 'stderr 泄漏了口令');
    assert.ok(!r.stdout.includes('secret-pw'), 'stdout 泄漏了 WebDAV 密码');
    assert.ok(!r.stderr.includes('secret-pw'), 'stderr 泄漏了 WebDAV 密码');
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});

test('backup 在远端目录不存在时明确报错，不自动建目录', async () => {
  const home = seedHome();
  const dav = await withWebdav(['/other']); // 没有 /backups
  try {
    const r = await runAsync(
      ['backup'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.equal(r.code, 1);
    assert.match(r.stderr, /远端目录不存在/);
    assert.equal(dav.files.size, 0, '不该在错误的位置悄悄建出目录');
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});

test('restore 能把备份恢复到全新的数据目录', async () => {
  const src = seedHome();
  const dav = await withWebdav();
  const parent = mkdtempSync(join(tmpdir(), 'cli-parent-'));
  const fresh = join(parent, 'restored-home'); // 刻意不创建
  try {
    const env = webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE });
    assert.equal((await runAsync(['backup'], src, env)).code, 0);
    const name = [...dav.files.keys()][0].split('/').pop();

    const r = await runAsync(['restore', name], fresh, env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /已从 .* 恢复/);
    assert.match(r.stdout, /rebuild/, '应提醒向量需要重算');

    const status = await runAsync(['status'], fresh);
    assert.match(status.stdout, /笔记\s+1/);
    assert.match(status.stdout, /1 已确认 \/ 1 待审核/);
  } finally {
    for (const d of [src, parent]) rmSync(d, { recursive: true, force: true });
    await dav.close();
  }
});

test('restore 口令不对时报错且不留半导入的库', async () => {
  const src = seedHome();
  const dav = await withWebdav();
  const parent = mkdtempSync(join(tmpdir(), 'cli-parent-'));
  const fresh = join(parent, 'wrong-pass-home');
  try {
    const env = webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE });
    assert.equal((await runAsync(['backup'], src, env)).code, 0);
    const name = [...dav.files.keys()][0].split('/').pop();

    const r = await runAsync(
      ['restore', name],
      fresh,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: 'wrong passphrase here' }),
    );
    assert.equal(r.code, 1, '口令错必须失败，绝不能「尽力而为」地导入');

    // 两种结果都可接受，但都必须「什么也没导入」：
    //   尚未创建 —— 解密先于建库失败，这是当前实现，也是更好的那个
    //   笔记 0   —— 万一将来解密挪到建库之后，也必须因事务回滚而空着
    // 半导入的知识库比没有知识库更难收拾，所以这里只断言「没有数据」，
    // 不锁死「库文件存不存在」这种实现细节
    const status = await runAsync(['status'], fresh);
    assert.match(status.stdout, /尚未创建|笔记\s+0/);
    assert.doesNotMatch(
      status.stdout,
      /笔记\s+[1-9]/,
      '绝不能留下半导入的数据',
    );
  } finally {
    for (const d of [src, parent]) rmSync(d, { recursive: true, force: true });
    await dav.close();
  }
});

test('restore 在远端没有这个备份时说清楚', async () => {
  const home = mkdtempSync(join(tmpdir(), 'cli-'));
  const dav = await withWebdav();
  try {
    const r = await runAsync(
      ['restore', 'nope.freesbk'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.equal(r.code, 1);
    assert.match(r.stderr, /没有这个备份/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});

/** 往内存服务里塞 n 份假备份，返回文件名列表。 */
function seedRemote(dav, stamps) {
  for (const t of stamps) {
    dav.files.set(`/backups/frees-studio-${t}.freesbk`, Buffer.from('x'));
  }
  return stamps.map((t) => `frees-studio-${t}.freesbk`);
}

test('retention 默认 dry-run：算出该删什么，但一个都不真删', async () => {
  const home = seedHome();
  const dav = await withWebdav();
  try {
    seedRemote(dav, [
      '2026-01-01T00-00-00-000',
      '2026-02-01T00-00-00-000',
      '2026-03-01T00-00-00-000',
      '2026-04-01T00-00-00-000',
    ]);
    const before = dav.files.size;

    const r = await runAsync(
      ['retention', '2'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /dry-run/);
    assert.match(r.stdout, /将删除\s+frees-studio-2026-01-01/);
    assert.match(r.stdout, /将删除\s+frees-studio-2026-02-01/);
    assert.match(r.stdout, /--apply/);
    assert.equal(dav.files.size, before, 'dry-run 绝不能真删');
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});

test('retention --apply 才真删，且保留最新', async () => {
  const home = seedHome();
  const dav = await withWebdav();
  try {
    seedRemote(dav, [
      '2026-01-01T00-00-00-000',
      '2026-02-01T00-00-00-000',
      '2026-03-01T00-00-00-000',
    ]);

    const r = await runAsync(
      ['retention', '1', '--apply'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(
      [...dav.files.keys()],
      ['/backups/frees-studio-2026-03-01T00-00-00-000.freesbk'],
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});

test('retention 即使算出该全删也必须留下最后一份', async () => {
  const home = seedHome();
  const dav = await withWebdav();
  try {
    seedRemote(dav, ['2026-01-01T00-00-00-000', '2026-02-01T00-00-00-000']);

    // keep=0 意味着「一份都不保留」—— 这个策略本身就是危险的。
    // 一个没有备份的系统，比一个备份太多的系统危险得多
    const r = await runAsync(
      ['retention', '0', '--apply'],
      home,
      webdavEnv(dav.url, { FREES_BACKUP_PASSPHRASE: PASSPHRASE }),
    );
    assert.equal(r.code, 0, r.stderr);
    assert.equal(dav.files.size, 1, '必须至少留下一份备份');
  } finally {
    rmSync(home, { recursive: true, force: true });
    await dav.close();
  }
});
