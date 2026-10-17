// 本地目录传输层（WEBDAV-001）—— 传输契约的第二个实现。
//
// ── 它为什么存在 ──
//
// 不是为了「本地备份」这个功能本身（数据库本来就在本地）。
// 它是**用来证明契约成立的**：换一个和 WebDAV 毫无共同点的后端 ——
// 没有 HTTP、没有 XML、没有 href、没有 URL 编码 —— 编排是否照常工作。
//
// 如果只有 WebDAV 一个实现，那么「传输层可替换」就永远只是一句话：
// 所有代码路径都长在 WebDAV 的形状上而没人会察觉。第二个实现把这句话
// 变成能跑的东西。它同时也是那个已知风险的**退路验证**：
// 123 云盘的 WebDAV 是会员功能、无官方协议文档、专用密码权限边界未知
// （见 docs/research/webdav-provider.md），万一那条路走不通，
// 我们要知道换掉它的代价到底有多大。
//
// ── 语义必须与 webdav.mjs 逐条一致 ──
//
// 存在性判定尤其要对齐，因为**「不存在」与「出错」被混淆时会静默丢数据**：
//
//   get  不存在 → null（不是抛错）
//   list 目录不存在 → []（不是抛错）
//   del  不存在 → false（不是抛错）
//
// 这三条如果实现成抛错，`runRetention` 会把异常当成「列举失败」，
// 而它的上游把空列表解读成「远端没有备份」—— 于是该留的被删、
// 或者该报的错被吞。所以下面刻意与 webdav.mjs 保持同一组返回。

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { assertTransport } from './transport.mjs';

/**
 * 把契约里的路径解析成根目录内的绝对路径，**越界即抛错**。
 *
 * 与 `webdav.mjs` 的 `url()` 是同一个职责：备份路径来自远端列举结果，
 * 而保留策略会拿它去删除。`..` 一旦生效，删的就是备份目录外面的文件 ——
 * 不可逆。
 *
 * 这里比 WebDAV 那边多一道：解析之后还要确认结果**确实在根目录内**。
 * WebDAV 只能逐段拒绝（它没有「根」的概念），而文件系统有，
 * 那就用上 —— `..` 的变体不止字面量一种。
 */
function resolveWithin(root, path) {
  const clean = path.replace(/^\/+/, '');
  for (const segment of clean.split('/')) {
    if (segment === '.' || segment === '..') {
      throw new Error(
        `拒绝含「${segment}」段的备份路径：${path}。` +
          '点号段会越出备份根目录，而删除是不可逆的。',
      );
    }
  }
  const full = resolve(root, clean);
  // 二次确认：即使上面漏了某种形态，也不能真的落到根外面
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`备份路径越出根目录：${path}`);
  }
  return full;
}

/**
 * 建一个以 `root` 为根的本地传输层。
 *
 * 与 WebDAV 实现一样**不自动建目录**：让程序自动创建目录意味着
 * 路径写错时会静默地在错误位置建一堆目录。目录不存在就明确报错。
 */
export function createLocalTransport({ root }) {
  if (!root) throw new Error('本地传输层需要一个根目录');
  const absRoot = resolve(root);

  const transport = {
    async put(path, buffer) {
      const full = resolveWithin(absRoot, path);
      const parent = dirname(full);
      if (!existsSync(parent)) {
        // 与 WebDAV 的 409 对应：目录不存在是**明确的错误**，不是静默创建
        throw new Error(`远端目录不存在：${path}。请先创建备份目录。`);
      }
      if (!Buffer.isBuffer(buffer)) {
        throw new Error('put 需要 Buffer');
      }
      writeFileSync(full, buffer);
      return { status: existsSync(full) ? 201 : 200 };
    },

    async get(path) {
      const full = resolveWithin(absRoot, path);
      if (!existsSync(full) || !statSync(full).isFile()) return null;
      return readFileSync(full);
    },

    async del(path) {
      const full = resolveWithin(absRoot, path);
      if (!existsSync(full)) return false;
      rmSync(full, { force: true });
      return true;
    },

    /** 列举目录下的文件名（不含路径）。目录不存在时返回空列表。 */
    async list(dirPath) {
      const full = resolveWithin(absRoot, dirPath || '/');
      if (!existsSync(full) || !statSync(full).isDirectory()) return [];
      return (
        readdirSync(full, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
          // 与 webdav.mjs 同样只接受单个文件名 —— 文件系统本来就不会
          // 给出带分隔符的名字，这条是防御性的对齐
          .filter(
            (name) =>
              name && !name.includes('/') && name !== '.' && name !== '..',
          )
          .sort()
      );
    },
  };

  return assertTransport(transport, '本地传输层');
}

/** 建目录（测试与首次使用时用）。**不在传输层里** —— 见 put 的注释。 */
export function ensureRoot(root) {
  mkdirSync(root, { recursive: true });
  return resolve(root);
}

/** 供测试用：把相对路径拼成绝对路径，不做安全检查。 */
export function pathIn(root, ...parts) {
  return join(root, ...parts);
}
