// CLI 测试。
//
// 用子进程跑真实的命令行入口，而不是直接调函数 ——
// CLI 的价值就在参数解析、退出码、输出这些「外壳」上，
// 只测函数等于把它最容易被写错的部分跳过去了。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
