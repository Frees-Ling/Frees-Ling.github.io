// 研究与审查流水线测试（KNOW-002）。
//
// 最要紧的一组是最后的「AI 不可绕过人工发布」——
// 它测的不是这一层的函数写得对不对，而是**绕过这一层之后还挡不挡得住**。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../db/schema.mjs';
import { tierOf, strongestTier, isSupported, TIER_LABEL } from './sources.mjs';
import {
  recordClaim,
  describeClaim,
  reviewQueue,
  decide,
  addSource,
  findDuplicates,
  validateClaims,
  flagConflict,
  conflicts,
  clearConflict,
  conflictFor,
} from './pipeline.mjs';

const fresh = () => openDatabase(':memory:');

// ── 来源分级 ──

test('按域名判等级，官方文档高于二手整理', () => {
  assert.equal(tierOf('https://docs.github.com/en/rest'), 'official');
  assert.equal(tierOf('https://arxiv.org/abs/1706.03762'), 'primary');
  assert.equal(tierOf('https://juejin.cn/post/123'), 'secondary');
});

test('子域自动继承，但**形近域名不能冒充**', () => {
  assert.equal(tierOf('https://en.wikipedia.org/wiki/X'), 'secondary');
  // 关键：evilw3.org 不是 w3.org 的子域，不能被后缀匹配蒙混过去
  assert.equal(tierOf('https://evilw3.org/spec'), 'unverified');
  assert.equal(tierOf('https://notwikipedia.org/x'), 'unverified');
});

test('没有地址是 unsourced，地址不合法是 unverified —— 两者不同', () => {
  assert.equal(tierOf(undefined), 'unsourced');
  assert.equal(tierOf(''), 'unsourced');
  assert.equal(tierOf('这不是地址'), 'unverified');
});

test('最强等级取最高的一条，没有来源时是 unsourced', () => {
  assert.equal(strongestTier([]), 'unsourced');
  assert.equal(
    strongestTier([
      { url: 'https://juejin.cn/a' },
      { url: 'https://w3.org/b' },
    ]),
    'official',
  );
});

test('unverified 不算「有依据」—— 门槛是 secondary', () => {
  assert.equal(isSupported([]), false);
  assert.equal(isSupported([{ url: 'https://someblog.example/a' }]), false);
  assert.equal(isSupported([{ url: 'https://juejin.cn/a' }]), true);
});

// ── 记录与查重 ──

test('记一条主张：默认进 pending，来源等级按域名算出来', () => {
  const db = fresh();
  const { claim, deduped } = recordClaim(db, {
    text: '注意力机制的复杂度随序列长度平方增长',
    sources: [
      {
        title: 'Attention Is All You Need',
        url: 'https://arxiv.org/abs/1706.03762',
      },
    ],
  });
  assert.equal(deduped, false);
  assert.equal(claim.status, 'pending', '人工来源也照样要审');
  assert.equal(
    claim.sources[0].tier,
    'primary',
    '等级由域名算出，不由调用方填',
  );
  assert.equal(claim.supported, true);
  db.close();
});

test('同样的主张不会记两条，但会**明确告诉调用方这是重复**', () => {
  const db = fresh();
  const a = recordClaim(db, { text: '矩阵乘法不满足交换律' });
  // 去重键会做 NFKC 归一、折叠空白、转小写 —— 这些差异都算同一条
  const b = recordClaim(db, { text: '  矩阵乘法不满足交换律  ' });
  assert.equal(b.deduped, true);
  assert.equal(b.claim.id, a.claim.id);
  assert.equal(reviewQueue(db).length, 1);
  db.close();
});

test('去重键**不**规范化标点 —— 这是已知边界，写下来免得被当成 bug', () => {
  const db = fresh();
  const a = recordClaim(db, { text: '矩阵乘法不满足交换律' });
  const b = recordClaim(db, { text: '矩阵乘法不满足交换律。' });
  // 尾句号会造成两条：与其放宽（可能把 `a>b` 与 `a<b` 合并），
  // 不如留着这点噪音 —— 队列里多一条目测可辨的重复，
  // 比悄悄合并两条语义相反的主张安全得多。
  assert.equal(b.deduped, false);
  assert.notEqual(b.claim.id, a.claim.id);
  db.close();
});

test('空主张被拒绝', () => {
  const db = fresh();
  assert.throws(() => recordClaim(db, { text: '   ' }), /不能为空/);
  db.close();
});

test('未知的来源类型被拒绝', () => {
  const db = fresh();
  assert.throws(
    () => recordClaim(db, { text: 'x', origin: 'robot' }),
    /未知的来源类型/,
  );
  db.close();
});

test('后补来源会把等级重算', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: '某个论断' });
  assert.equal(claim.supported, false);
  addSource(db, claim.id, {
    title: 'MDN',
    url: 'https://developer.mozilla.org/x',
  });
  assert.equal(describeClaim(db, claim.id).strongestTier, 'official');
  db.close();
});

// ── 校验 ──

test('校验只报告问题，**不改动任何记录**', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: '没有来源的论断' });
  recordClaim(db, {
    text: '来源不够硬的论断',
    sources: [{ title: '某人的博客', url: 'https://random-blog.example/post' }],
  });

  const issues = validateClaims(db);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((i) => i.kind).sort(), [
    'unsourced',
    'weak-source',
  ]);
  // 关键：报告之后记录原封不动，仍等人处理
  assert.equal(describeClaim(db, claim.id).status, 'pending');
  assert.equal(reviewQueue(db).length, 2);
  db.close();
});

test('有够格来源的主张不出现在问题清单里', () => {
  const db = fresh();
  recordClaim(db, {
    text: '有官方来源的论断',
    sources: [{ title: 'W3C', url: 'https://w3.org/TR/x' }],
  });
  assert.deepEqual(validateClaims(db), []);
  db.close();
});

// ── 冲突 ──

test('冲突由人显式标记，不自动推断', () => {
  const db = fresh();
  const a = recordClaim(db, { text: '这个模型的参数量是 7B' }).claim;
  const b = recordClaim(db, { text: '这个模型的参数量是 13B' }).claim;

  // 两条互相矛盾的主张并排存在时，**什么也不会自动发生**
  assert.deepEqual(conflicts(db), []);

  const group = flagConflict(db, [a.id, b.id]);
  assert.equal(conflicts(db).length, 1);
  assert.equal(conflictFor(db, a.id), group);
  assert.equal(clearConflict(db, group), 2);
  assert.equal(conflictFor(db, a.id), null);
  db.close();
});

test('冲突至少要两条主张', () => {
  const db = fresh();
  const a = recordClaim(db, { text: 'x' }).claim;
  assert.throws(() => flagConflict(db, [a.id]), /至少涉及两条/);
  db.close();
});

test('标记不存在的主张会报错，不留半个分组', () => {
  const db = fresh();
  const a = recordClaim(db, { text: 'x' }).claim;
  assert.throws(() => flagConflict(db, [a.id, '不存在']), /没有这条主张/);
  assert.deepEqual(conflicts(db), []);
  db.close();
});

// ── 审查队列与决定 ──

test('队列默认只列待审的', () => {
  const db = fresh();
  const a = recordClaim(db, { text: '一' }).claim;
  recordClaim(db, { text: '二' });
  decide(db, a.id, { status: 'approved', decidedBy: 'human' });

  assert.equal(reviewQueue(db).length, 1);
  assert.equal(reviewQueue(db, { status: 'approved' }).length, 1);
  assert.equal(reviewQueue(db, { status: 'all' }).length, 2);
  db.close();
});

test('**AI 不能批准** —— 这一层就把话说清楚', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: 'AI 写的东西', origin: 'ai' });
  assert.throws(
    () => decide(db, claim.id, { status: 'approved', decidedBy: 'ai' }),
    /只有人才能批准/,
  );
  assert.equal(describeClaim(db, claim.id).status, 'pending', '失败不留痕');
  db.close();
});

test('AI 可以**否决** —— 否决不让任何东西生效', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: 'x', origin: 'ai' });
  const done = decide(db, claim.id, { status: 'rejected', decidedBy: 'ai' });
  assert.equal(done.status, 'rejected');
  assert.equal(done.decidedBy, 'ai');
  db.close();
});

test('必须显式说明是谁做的结论，没有默认值', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: 'x' });
  assert.throws(
    () => decide(db, claim.id, { status: 'approved' }),
    /必须显式说明/,
  );
  assert.throws(
    () => decide(db, claim.id, { status: 'pending', decidedBy: 'human' }),
    /只能是 approved 或 rejected/,
  );
  db.close();
});

// ── 安全属性：绕不过去 ──

test('**即使绕过这一层直接写库，AI 也批准不了**', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: 'AI 写的东西', origin: 'ai' });

  // 模拟「某条新路径忘了检查」或「有人手写 SQL」——
  // 绕过了 pipeline.mjs 的全部校验，直接 UPDATE
  assert.throws(
    () =>
      db
        .prepare(
          "UPDATE claims SET status = 'approved', decided_by = 'ai' WHERE id = ?",
        )
        .run(claim.id),
    /CHECK|constraint/i,
    '数据库必须拒绝 AI 的自我批准',
  );

  // 连「不写 decided_by 就批准」也不行
  assert.throws(
    () =>
      db
        .prepare("UPDATE claims SET status = 'approved' WHERE id = ?")
        .run(claim.id),
    /CHECK|constraint/i,
  );

  // 而人来做同一件事是通的
  db.prepare(
    "UPDATE claims SET status = 'approved', decided_by = 'human' WHERE id = ?",
  ).run(claim.id);
  assert.equal(describeClaim(db, claim.id).status, 'approved');
  db.close();
});

test('未知状态被数据库拒绝', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: 'x' });
  assert.throws(
    () =>
      db
        .prepare("UPDATE claims SET status = 'published' WHERE id = ?")
        .run(claim.id),
    /CHECK|constraint/i,
  );
  db.close();
});

test('来源等级只接受五个已知值', () => {
  const db = fresh();
  const { claim } = recordClaim(db, { text: 'x' });
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO claim_sources (claim_id, title, tier) VALUES (?, '标题', 'best')",
        )
        .run(claim.id),
    /CHECK|constraint/i,
  );
  db.close();
});

test('删掉主张会连带清掉它的来源与冲突标记', () => {
  const db = fresh();
  const a = recordClaim(db, {
    text: 'a',
    sources: [{ title: 'W3C', url: 'https://w3.org/x' }],
  }).claim;
  const b = recordClaim(db, { text: 'b' }).claim;
  flagConflict(db, [a.id, b.id]);

  db.prepare('DELETE FROM claims WHERE id = ?').run(a.id);
  assert.deepEqual(conflicts(db), [], '冲突分组随主张一起清掉');
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM claim_sources').get().n,
    0,
    '来源随主张级联删除',
  );
  db.close();
});

test('等级说明文案覆盖全部五级', () => {
  for (const t of [
    'official',
    'primary',
    'secondary',
    'unverified',
    'unsourced',
  ]) {
    assert.ok(TIER_LABEL[t], `缺少 ${t} 的说明`);
  }
});
