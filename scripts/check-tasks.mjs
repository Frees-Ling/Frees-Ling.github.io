// 任务清单闸门。
//
//   node scripts/check-tasks.mjs           检查
//   node scripts/check-tasks.mjs --ready   顺便列出可开工的任务
//
// ── 为什么需要它 ──
//
// 2026-09-17 实测：TASKS.md 里出现了**两块 STUDIO-002** ——
// 一块是我的编辑插入的 DONE，另一块是没被清掉的原始 BACKLOG。
// 而所有读这份文件的东西（包括我自己每轮跑的依赖分析）都是
// 「按名字取，后出现的覆盖先出现的」，于是拿到的是 BACKLOG。
//
// 后果不是「多了一行」：STUDIO-002 被判为未完成 → EDITOR-001 被阻塞 →
// KNOW-001 被阻塞 → ACCESS-001 被阻塞。**整条链被一条过期的重复条目堵住**，
// 而每一轮的分析都给出「这几项还不能做」这种看起来完全正常的结论。
//
// 这和本项目里反复出现的其它缺陷是同一类：**输出看起来正常，但是错的**。
// 靠人眼盯 40 多个条目的重复不现实，所以上机器闸门。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = `${ROOT}docs/execution/TASKS.md`;

const VALID_STATUS = ['DONE', 'ACTIVE', 'READY', 'BACKLOG'];

/** 解析任务清单。**不做去重** —— 重复正是要报出来的一件事。 */
export function parseTasks(text) {
  const blocks = text.split(/^### /m).slice(1);
  return blocks.map((block) => {
    const [heading = '', ...rest] = block.split('\n');
    const body = rest.join('\n');
    const status = /^- Status:\s*(\S+)/m.exec(body)?.[1] ?? null;
    const phase = /^- Phase:\s*(\S+)/m.exec(body)?.[1] ?? null;
    const depsRaw = /^- Depends-On:\s*(.+)$/m.exec(body)?.[1] ?? '';
    return {
      id: heading.split(' — ')[0].trim(),
      title: heading.split(' — ')[1]?.trim() ?? '',
      status,
      // 有 Status 才是任务；否则可能是任务内的小节
      hasStatus: status !== null,
      looksLikeTask: /^- Acceptance[：:]/m.test(body)
        ? 'Acceptance'
        : /^- Depends-On:/m.test(body)
          ? 'Depends-On'
          : null,
      phase,
      // 同时接受半角逗号与中文顿号：作者用顿号是很自然的写法，
      // 而「写作习惯」不该让一条依赖静默失效。`-` 表示没有依赖。
      deps: depsRaw
        .split(/[,、]/)
        .map((d) => d.trim())
        .filter((d) => d && d !== '-'),
    };
  });
}

const text = readFileSync(FILE, 'utf8');

// 约定：`###` 是任务，`####` 是任务内部的小节。
// 但光靠约定不够 —— 在任务里写一个 `### 小节名` 是很自然的事，
// 实测就这么踩过一次：加了一节说明，闸门立刻报「任务 稳定 block ID 缺少 Status」。
// 所以判定改为**看内容**：有 `- Status:` 的才是任务。
//
// 但「缺少 Status 的真实任务」不能被静默略过，那等于把校验关掉一半。
// 因此补一条：若一个块带着任务特有的字段却没有 Status，仍然报出来。
const ALL = parseTasks(text).filter((t) => t.hasStatus);
const problems = [];

for (const t of parseTasks(text)) {
  if (t.status) continue;
  if (t.looksLikeTask) {
    problems.push(
      `「${t.id}」带着 ${t.looksLikeTask} 却没有 Status —— 是漏写了，还是本该用 #### 写成小节？`,
    );
  }
}

const tasks = ALL;

// ① 重复 id —— 这一条就是本次真实踩到的那个
const byId = new Map();
for (const t of tasks) {
  if (byId.has(t.id)) {
    problems.push(
      `任务 ${t.id} 出现了多次。读取方（包括依赖分析）通常按名字取最后一次，` +
        '于是过期的那条会静默生效 —— 实测因此堵住了整条链路。',
    );
  }
  byId.set(t.id, t);
}

// ② 状态取值
for (const t of tasks) {
  if (!VALID_STATUS.includes(t.status)) {
    problems.push(
      `任务 ${t.id} 的 Status 是「${t.status}」，不在 ${VALID_STATUS.join(' / ')} 之内`,
    );
  }
}

// ③ 依赖必须指向存在的任务 —— 拼错一个字母就会让「已满足」变成永远不满足
for (const t of tasks) {
  for (const dep of t.deps) {
    if (!byId.has(dep)) {
      problems.push(`任务 ${t.id} 依赖了不存在的 ${dep}（拼写错误？）`);
    }
  }
}

// ④ 依赖成环
const done = new Set(tasks.filter((t) => t.status === 'DONE').map((t) => t.id));
const ready = [];
const blocked = new Map();
for (const t of tasks) {
  if (t.status === 'DONE') continue;
  const unmet = t.deps.filter((d) => !done.has(d));
  if (unmet.length === 0) ready.push(t);
  else blocked.set(t.id, unmet);
}

const visiting = new Set();
const visited = new Set();
function hasCycle(id, stack = []) {
  if (visiting.has(id)) return [...stack, id];
  if (visited.has(id)) return null;
  visiting.add(id);
  for (const dep of byId.get(id)?.deps ?? []) {
    const cycle = hasCycle(dep, [...stack, id]);
    if (cycle) return cycle;
  }
  visiting.delete(id);
  visited.add(id);
  return null;
}
for (const t of tasks) {
  const cycle = hasCycle(t.id);
  if (cycle) {
    problems.push(`依赖成环：${cycle.join(' → ')}`);
    break;
  }
}

if (problems.length > 0) {
  console.error(`✗ 任务清单有 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log(
  `✓ 任务清单：${tasks.length} 项，无重复、无悬空依赖、无环` +
    `（已完成 ${done.size}，可开工 ${ready.length}，阻塞 ${blocked.size}）`,
);

if (process.argv.includes('--ready')) {
  console.log('\n可开工：');
  for (const t of ready)
    console.log(`  ${t.id.padEnd(14)} phase ${t.phase ?? '-'}  ${t.title}`);
  console.log('\n阻塞：');
  for (const [id, unmet] of blocked) {
    console.log(`  ${id.padEnd(14)} 等 ${unmet.join(', ')}`);
  }
}
