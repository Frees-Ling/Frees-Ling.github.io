// 长期记忆服务测试（MEM-001）。
//
// 这一层的价值集中在「不该发生的事没发生」：
// AI 提取的内容没直接生效、纠正没抹掉历史、有争议的没被当成依据。
// 用例也照着这个方向写 —— 断言拒绝与排除，而不只是断言成功。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../db/schema.mjs';
import { exportAll } from '../db/portable.mjs';
import {
  createNote,
  importArchiveEntry,
  createConversation,
  addMessage,
} from '../db/store.mjs';
import {
  createMemoryService,
  normalizeContent,
  dedupKeyOf,
} from './service.mjs';

const fresh = () => {
  const db = openDatabase(':memory:');
  return { db, svc: createMemoryService(db) };
};

/** 走完「添加 → 审核通过」，返回生效的记忆。 */
function approved(svc, content) {
  const { memory } = svc.add({ content, source: 'user' });
  svc.review(memory.id, 'approved');
  return memory.id;
}

// ── 写入路径：AI 提取永远不会直接生效 ──

test('add 写入的记忆一律是 pending', () => {
  const { db, svc } = fresh();
  const { memory } = svc.add({ content: '用户偏好中文写作', source: 'auto' });
  assert.equal(memory.status, 'pending');
  assert.equal(svc.search('中文').length, 0, '未审核的不得进入检索');
  db.close();
});

test('待审核与被拒绝的记忆都不进检索', () => {
  const { db, svc } = fresh();
  const a = svc.add({ content: '待审核的结论', source: 'user' }).memory;
  const b = svc.add({ content: '会被拒绝的结论', source: 'user' }).memory;
  svc.review(b.id, 'rejected');

  assert.equal(svc.search('结论').length, 0);
  assert.equal(svc.provenance(a.id).memory.status, 'pending');
  db.close();
});

// ── 审核 ──

test('审核通过后才进入检索', () => {
  const { db, svc } = fresh();
  const id = approved(svc, '用户在写一个静态博客');
  const hits = svc.search('静态博客');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, id);
  db.close();
});

test('已审核的记忆不能被重复审核', () => {
  const { db, svc } = fresh();
  const id = approved(svc, '某条结论');
  assert.throws(() => svc.review(id, 'rejected'), /已审核过/);
  db.close();
});

// ── 去重 ──

test('规范化会吃掉空白、大小写与全角半角差异', () => {
  assert.equal(normalizeContent('  Hello   World  '), 'hello world');
  // NFKC：全角括号与全角数字应当折成半角
  assert.equal(normalizeContent('（１）'), '(1)');
});

test('内容规范化后相同的会被报为重复，但**不自动合并**', () => {
  const { db, svc } = fresh();
  const first = svc.add({ content: '用户偏好中文写作', source: 'user' }).memory;

  // 全角/空白差异，规范化后与上一条相同
  const second = svc.add({ content: '  用户偏好中文写作　', source: 'user' });
  assert.equal(second.duplicates.length, 1, '应报出重复');
  assert.equal(second.duplicates[0].id, first.id);
  assert.notEqual(second.memory.id, first.id, '合并是判断，不能自动做');

  assert.equal(svc.list({ status: 'pending' }).length, 2, '两条都在，等人裁决');
  db.close();
});

test('回填去重键只影响缺失的那些', () => {
  const { db, svc } = fresh();
  svc.add({ content: '甲', source: 'user' });
  svc.add({ content: '乙', source: 'user' });
  db.prepare('UPDATE memories SET dedup_key = NULL').run();

  assert.equal(svc.backfillDedupKeys(), 2);
  assert.equal(svc.backfillDedupKeys(), 0, '再跑一次不应有可回填的');
  assert.equal(svc.findDuplicates('甲').length, 1);
  db.close();
});

// ── 纠正：追加，不改写 ──

test('纠正是追加：旧条保留且被标记取代，新条生效', () => {
  const { db, svc } = fresh();
  const oldId = approved(svc, '用户偏好中文写作');
  const { previous, current } = svc.correct(oldId, {
    content: '用户偏好中文技术写作',
  });

  assert.equal(previous.id, oldId);
  assert.equal(previous.superseded_by, current.id, '旧条要指向新条');
  assert.equal(current.status, 'approved');
  assert.equal(current.confidence, 1, '纠正来自人的判断，置信度为 1');

  // 关键：旧的那条**还在**，只是不再生效 —— 这是可审计的全部意义
  assert.ok(svc.provenance(oldId).memory, '旧条必须还在库里');
  assert.equal(svc.provenance(oldId).memory.content, '用户偏好中文写作');
  db.close();
});

test('被取代的记忆不进入检索', () => {
  const { db, svc } = fresh();
  const oldId = approved(svc, '结论是 A');
  svc.correct(oldId, { content: '结论是 B' });

  const hits = svc.search('结论是');
  assert.equal(hits.length, 1, '只应看到生效的那条');
  assert.equal(hits[0].content, '结论是 B');
  db.close();
});

test('取代链能还原完整历史', () => {
  const { db, svc } = fresh();
  const first = approved(svc, '第一版');
  const second = svc.correct(first, { content: '第二版' }).current.id;
  const third = svc.correct(second, { content: '第三版' }).current.id;

  const chain = svc.supersessionChain(first);
  assert.deepEqual(
    chain.map((m) => m.content),
    ['第一版', '第二版', '第三版'],
    '从任意一环出发都应能走到最新',
  );
  assert.equal(chain.at(-1).id, third);
  db.close();
});

test('只有已确认的记忆才能纠正', () => {
  const { db, svc } = fresh();
  const pending = svc.add({ content: '还没审核', source: 'user' }).memory;
  assert.throws(
    () => svc.correct(pending.id, { content: '改一下' }),
    /只有已确认/,
  );

  const rejected = svc.add({ content: '会被拒', source: 'user' }).memory;
  svc.review(rejected.id, 'rejected');
  assert.throws(
    () => svc.correct(rejected.id, { content: '改一下' }),
    /只有已确认/,
  );
  db.close();
});

test('同一条不能被纠正两次（否则历史会分叉）', () => {
  const { db, svc } = fresh();
  const id = approved(svc, '原始结论');
  svc.correct(id, { content: '改法一' });
  assert.throws(() => svc.correct(id, { content: '改法二' }), /已经被取代/);
  db.close();
});

test('纠正不存在或内容非法的输入会被拒绝', () => {
  const { db, svc } = fresh();
  assert.throws(() => svc.correct('不存在的-id', { content: 'x' }), /不存在/);
  const id = approved(svc, '原始');
  assert.throws(() => svc.correct(id, { content: '   ' }), /不能为空/);
  db.close();
});

// ── 冲突标记 ──

test('标记冲突后两条都不再作为依据，清除后恢复', () => {
  const { db, svc } = fresh();
  const a = approved(svc, '这个项目用 Astro');
  const b = approved(svc, '这个项目用 Next.js');

  assert.equal(svc.search('这个项目').length, 2, '标记前两条都可检索');

  const group = svc.flagConflict([a, b]);
  assert.equal(svc.search('这个项目').length, 0, '有争议时不得当作依据');
  assert.equal(svc.conflicts().length, 2);

  assert.equal(svc.clearConflict(group), 2);
  assert.equal(svc.search('这个项目').length, 2);
  db.close();
});

test('冲突至少要两条，且不能包含不存在的记忆', () => {
  const { db, svc } = fresh();
  const a = approved(svc, '甲');
  assert.throws(() => svc.flagConflict([a]), /至少需要两条/);
  assert.throws(() => svc.flagConflict([a, '不存在']), /不存在/);
  db.close();
});

test('includeConflicted 可以显式取回有争议的那些（供人工裁决）', () => {
  const { db, svc } = fresh();
  const a = approved(svc, '说法一');
  const b = approved(svc, '说法二');
  svc.flagConflict([a, b]);
  assert.equal(svc.search('说法').length, 0);
  assert.equal(
    svc.search('说法', { includeConflicted: true }).length,
    2,
    '要能取出来，否则没法裁决',
  );
  db.close();
});

// ── 可见性 ──

test('可见性默认 private，exportable 只给显式放行的', () => {
  const { db, svc } = fresh();
  const a = approved(svc, '私密结论');
  const b = svc.add({
    content: '可对外结论',
    source: 'user',
    visibility: 'exportable',
  }).memory;
  svc.review(b.id, 'approved');

  assert.equal(
    svc.provenance(a).memory.visibility,
    'private',
    '默认必须是对内',
  );
  const out = svc.exportable();
  assert.equal(out.length, 1);
  assert.equal(out[0].id, b.id);
  db.close();
});

test('可见性只能取两个值，且不存在的记忆会报错', () => {
  const { db, svc } = fresh();
  const id = approved(svc, '某条');
  assert.throws(
    () => svc.setVisibility(id, 'public'),
    /只能是 private 或 exportable/,
  );
  assert.throws(() => svc.setVisibility('不存在', 'private'), /不存在/);
  assert.equal(svc.setVisibility(id, 'exportable').visibility, 'exportable');
  db.close();
});

test('有争议或被取代的即使标为 exportable 也不导出', () => {
  const { db, svc } = fresh();
  const a = svc.add({
    content: '甲',
    source: 'user',
    visibility: 'exportable',
  }).memory;
  const b = svc.add({
    content: '乙',
    source: 'user',
    visibility: 'exportable',
  }).memory;
  svc.review(a.id, 'approved');
  svc.review(b.id, 'approved');
  svc.flagConflict([a.id, b.id]);
  assert.equal(svc.exportable().length, 0);
  db.close();
});

// ── 自动提取开关 ──

test('自动提取默认开启', () => {
  const { db, svc } = fresh();
  assert.equal(svc.isAutoCaptureEnabled(), true);
  db.close();
});

test('关掉之后自动提取被拒，但手动提取不受影响', () => {
  const { db, svc } = fresh();
  svc.setAutoCapture(false);

  assert.throws(
    () => svc.add({ content: '自动提取的结论', source: 'auto' }),
    /自动提取记忆已关闭/,
    '开关关掉后自动提取必须被拦住',
  );

  // 这是这个开关最容易做错的地方：把手动也一起拦掉，
  // 用户会觉得「我把自动关了，结果手动也存不进去」
  const { memory } = svc.add({ content: '手动存下的结论', source: 'user' });
  assert.ok(memory.id);

  svc.setAutoCapture(true);
  assert.equal(
    svc.add({ content: '恢复后的自动提取', source: 'auto' }).memory.status,
    'pending',
  );
  db.close();
});

test('不写 source 时按 auto 处理（保守侧）', () => {
  const { db, svc } = fresh();
  svc.setAutoCapture(false);
  assert.throws(() => svc.add({ content: '没写来源' }), /自动提取记忆已关闭/);
  db.close();
});

// ── 关联知识库与来源 ──

test('记忆可关联知识库条目，且来源可追溯', () => {
  const { db, svc } = fresh();
  const note = createNote(db, { title: '笔记', body: '正文', tags: [] });
  const id = approved(svc, '一条结论');

  svc.linkToNote(id, note.id);
  assert.equal(svc.notesFor(id).length, 1);
  svc.unlinkFromNote(id, note.id);
  assert.equal(svc.notesFor(id).length, 0);
  db.close();
});

test('provenance 把记忆与它的三类来源连起来', () => {
  const { db, svc } = fresh();
  const note = createNote(db, {
    title: '被引用的笔记',
    body: '正文',
    tags: [],
  });

  // 真造一条链路：档案 → 记忆，另加一个对话消息来源
  const entry = importArchiveEntry(db, {
    kind: 'conversation',
    source: '导入的对话',
    content: '原始对话内容',
  });
  const conv = createConversation(db, { title: '关于写作偏好的对话' });
  const msg = addMessage(db, conv.id, {
    role: 'assistant',
    content: '你偏好中文技术写作。',
  });

  const { memory } = svc.add({
    content: '用户偏好中文技术写作',
    sourceEntryId: entry.id,
    sourceMessageId: msg.id,
    source: 'user',
  });
  svc.review(memory.id, 'approved');
  svc.linkToNote(memory.id, note.id);

  const prov = svc.provenance(memory.id);
  assert.equal(prov.memory.id, memory.id);
  assert.equal(prov.archive.id, entry.id, '要能追到原始档案');
  assert.equal(prov.message.id, msg.id, '要能追到来源消息');
  assert.equal(prov.message.conversation_title, '关于写作偏好的对话');
  assert.equal(prov.notes.length, 1, '要能列出关联的知识库条目');
  assert.equal(prov.notes[0].id, note.id);
  db.close();
});

test('来源被删除时记忆仍在，只是来源置空', () => {
  const { db, svc } = fresh();
  const conv = createConversation(db, { title: '临时对话' });
  const msg = addMessage(db, conv.id, {
    role: 'assistant',
    content: '一条会被删掉来源的回答',
  });
  const { memory } = svc.add({
    content: '结论不该随来源一起消失',
    sourceMessageId: msg.id,
    source: 'user',
  });
  svc.review(memory.id, 'approved');

  db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);

  // 删掉一次对话不该销毁它产生的结论 —— 那等于用清理动作丢失已确认的事实
  const prov = svc.provenance(memory.id);
  assert.ok(prov, '记忆必须还在');
  assert.equal(prov.message, null, '来源没了就置空');
  assert.equal(svc.search('结论不该').length, 1, '仍然可检索');
  db.close();
});

// ── 删除 ──

test('删除返回是否真的删掉了', () => {
  const { db, svc } = fresh();
  const id = approved(svc, '待删除');
  assert.equal(svc.remove(id), true);
  assert.equal(svc.remove(id), false);
  assert.equal(svc.provenance(id), null);
  db.close();
});

// ── 与三层模型和导出的一致性 ──

test('记忆与档案、知识库是三张不同的表，字段不混用', () => {
  const { db } = fresh();
  const cols = (t) =>
    db
      .prepare(`PRAGMA table_info(${t})`)
      .all()
      .map((c) => c.name);

  assert.ok(cols('archive_entries').includes('kind'), '档案有自己的 kind');
  assert.ok(cols('notes').includes('title'), '知识库有标题');
  assert.ok(cols('memories').includes('confidence'), '记忆有置信度');
  // 记忆表里不该出现知识库的字段，反之亦然 ——
  // 「三层分离」如果只是三张表但字段互相塞，那还是混在一起
  assert.ok(!cols('memories').includes('title'), '记忆没有标题，它不是条目');
  assert.ok(!cols('notes').includes('confidence'), '知识库条目不携带置信度');
  db.close();
});

test('完整导出会带走全部记忆（含被取代与被拒绝的）', () => {
  const { db, svc } = fresh();
  const a = approved(svc, '生效的结论');
  svc.correct(a, { content: '纠正后的结论' });
  const rejected = svc.add({ content: '被拒的结论', source: 'user' }).memory;
  svc.review(rejected.id, 'rejected');

  const data = exportAll(db);
  assert.equal(data.memories.length, 3, '导出必须完整，否则换引擎会丢历史');
  assert.ok(
    data.memories.some((m) => m.superseded_by),
    '被取代的关系也要带走',
  );
  db.close();
});

test('重启后记忆仍在，且取代关系与冲突标记都还在', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mem-'));
  const path = join(dir, 'm.db');
  try {
    const first = openDatabase(path);
    const svc1 = createMemoryService(first);
    const a = approved(svc1, '原始结论');
    const corrected = svc1.correct(a, { content: '纠正后' }).current.id;
    const b = approved(svc1, '另一条');
    const c = approved(svc1, '第三条');
    const group = svc1.flagConflict([b, c]);
    first.close();

    const second = openDatabase(path);
    const svc2 = createMemoryService(second);
    assert.equal(svc2.supersessionChain(a).length, 2, '取代链要还在');
    assert.equal(svc2.provenance(a).memory.superseded_by, corrected);
    assert.equal(svc2.conflicts().length, 2, '冲突标记要还在');
    assert.equal(svc2.search('另一条').length, 0, '有争议的仍不进检索');
    assert.equal(svc2.clearConflict(group), 2);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('去重键在重启后仍然可比', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mem2-'));
  const path = join(dir, 'm.db');
  try {
    const first = openDatabase(path);
    createMemoryService(first).add({
      content: '跨重启的重复内容',
      source: 'user',
    });
    first.close();

    const second = openDatabase(path);
    const dup = createMemoryService(second).findDuplicates('跨重启的重复内容');
    assert.equal(dup.length, 1);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('去重键是内容决定的：同一句话任何时候算出同一个键', () => {
  assert.equal(
    dedupKeyOf('用户偏好中文写作'),
    dedupKeyOf('  用户偏好中文写作  '),
  );
  assert.notEqual(dedupKeyOf('结论 A'), dedupKeyOf('结论 B'));
});
