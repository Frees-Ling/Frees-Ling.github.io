// 原始档案的导入（ARCH-001）。
//
// ── 这一层存在的理由 ──
//
// 档案是三层模型里**不可被摘要替代**的底档。摘要会丢信息，而底档不会 ——
// 所以「导入」这件事的失败方式很特别：**丢一条不会报错**，
// 只会在几个月后想查某段原始对话时才发现它从来没进来过。
//
// 因此这里的三条要求都是针对「静默丢失」的：
//   增量   —— 只加新的，不动已有的
//   去重   —— 同一份内容导一百次还是一条（内容哈希，见 store.mjs）
//   幂等   —— 重复导入不产生重复，也不产生「差一点」的副本
//
// ── 只读用户主动提供的文件 ──
//
// **不抓取、不扫描、不联网。** 这个模块接受的只有调用方明确交进来的
// 路径与内容。没有「自动发现」，没有 URL 导入，没有账户同步 ——
// 验收里那句「未获确认不得抓取」在这里的落点是：**根本没有那个函数**。
// 不是默认关闭，是不存在。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

import { importArchiveEntry } from '../db/store.mjs';

/** 单次导入的上限，防止一个巨型文件把内存吃干。 */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 5000;

/**
 * 从一段 Markdown 导入一条档案。
 *
 * 标题行（首个 `# `）会被当作来源标注的一部分 —— 它在原始文件里
 * 就是人给这段内容起的名字，丢掉它等于丢掉一半的上下文。
 */
export function importMarkdown(db, { text, source }) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('内容为空');
  }
  return importArchiveEntry(db, {
    kind: 'document',
    source,
    content: text,
  });
}

/**
 * 从结构化 JSON 导入。
 *
 * 接受两种形态：
 *   · 一个对象数组 —— 每个元素一条
 *   · 单个对象 —— 一条
 *
 * 每条至少要有 `content`；`source` 与 `kind` 可选，缺省从外层继承。
 * **不强求某个特定 schema**：用户手上的导出文件五花八门，
 * 要求他们先改成我们的格式，等于把整理成本推回给用户。
 */
export function importJson(db, { data, source, kind = 'document' }) {
  const items = Array.isArray(data) ? data : [data];
  if (items.length > MAX_FILES) {
    throw new Error(`一次最多导入 ${MAX_FILES} 条，收到 ${items.length} 条`);
  }

  const result = { imported: 0, deduped: 0, skipped: 0, errors: [] };

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') {
      result.skipped++;
      result.errors.push(`第 ${index + 1} 条不是对象`);
      continue;
    }
    const content =
      typeof item.content === 'string'
        ? item.content
        : typeof item.text === 'string'
          ? item.text
          : typeof item.body === 'string'
            ? item.body
            : null;

    if (content === null || !content.trim()) {
      // 记下来而不是静默跳过：用户需要知道哪几条没进来
      result.skipped++;
      result.errors.push(`第 ${index + 1} 条没有 content / text / body 字段`);
      continue;
    }

    const entry = importArchiveEntry(db, {
      kind: normalizeKind(item.kind ?? kind),
      source: String(item.source ?? source ?? '未注明来源'),
      content,
    });
    if (entry.deduped) result.deduped++;
    else result.imported++;
  }

  return result;
}

/** 只接受表里允许的 kind，未知的一律归为 document 而不是报错中断整批。 */
function normalizeKind(kind) {
  return ['conversation', 'document', 'edit'].includes(kind)
    ? kind
    : 'document';
}

/**
 * 导入一个文件。按扩展名分派。
 *
 * 不认识的扩展名**按 Markdown 处理**而不是拒绝 —— 用户手上的导出文件
 * 常常是 `.txt` 或没有扩展名，而「因为扩展名不认识所以没导入」
 * 是一种很难被发现的丢失。
 */
export function importFile(db, { path, source }) {
  const stat = statSync(path);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(
      `文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB，上限 ${MAX_FILE_BYTES / 1024 / 1024} MB）`,
    );
  }

  const text = readFileSync(path, 'utf8');
  const label = source ?? relative(process.cwd(), path);
  const ext = extname(path).toLowerCase();

  if (ext === '.json') {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${basename(path)} 不是合法 JSON：${error.message}`);
    }
    return importJson(db, { data, source: label });
  }

  const entry = importMarkdown(db, { text, source: label });
  return {
    imported: entry.deduped ? 0 : 1,
    deduped: entry.deduped ? 1 : 0,
    skipped: 0,
    errors: [],
  };
}

/**
 * 递归导入一个目录下的文件。
 *
 * **只读文件，不跟随符号链接**：跟随的话，一个指向父目录的链接会让
 * 整个家目录被卷进档案里 —— 而用户的本意只是导入那个文件夹。
 */
export function importDirectory(db, { dir, source }) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (files.length > MAX_FILES) {
        throw new Error(`文件数超过上限 ${MAX_FILES}，请分批导入`);
      }
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue; // 见上：不跟随
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (/\.(md|markdown|txt|json)$/i.test(entry.name)) files.push(full);
    }
  };
  walk(dir);

  const total = {
    imported: 0,
    deduped: 0,
    skipped: 0,
    errors: [],
    files: files.length,
  };
  for (const file of files.sort()) {
    try {
      const r = importFile(db, {
        path: file,
        source: source
          ? `${source}/${relative(dir, file)}`
          : relative(dir, file),
      });
      total.imported += r.imported;
      total.deduped += r.deduped;
      total.skipped += r.skipped;
      total.errors.push(...r.errors.map((e) => `${relative(dir, file)}: ${e}`));
    } catch (error) {
      // 单个文件失败不该中断整批，但必须被记下来
      total.errors.push(`${relative(dir, file)}: ${error.message}`);
    }
  }
  return total;
}

/**
 * 找出「同一个来源、内容却不同」的档案。
 *
 * 这就是这一层里「冲突」的实际含义：不是两条内容互相矛盾（那需要语义判断），
 * 而是**同一份文件在不同时间被导入时内容变了** —— 例如用户更新了导出文件
 * 再导一次。两条都留着（内容哈希不同），而这里把它们指出来，
 * 因为「哪一版才是最新的」只有用户知道。
 */
export function findConflicts(db) {
  const rows = db
    .prepare(
      `SELECT source, COUNT(DISTINCT hash) AS versions, COUNT(*) AS entries,
              MIN(created_at) AS first_at, MAX(created_at) AS last_at
         FROM archive_entries
        GROUP BY source
       HAVING versions > 1
        ORDER BY last_at DESC`,
    )
    .all();
  return rows.map((r) => ({
    source: r.source,
    versions: r.versions,
    ...(r.entries !== r.versions ? { duplicateRows: r.entries } : {}),
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
}
