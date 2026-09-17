// 知识层测试（KNOW-001）。
//
// 这一层是**索引**不是图（ADR-019 已用真实语料否掉节点-连线式关系图），
// 所以用例集中在「解析得准不准、缺的会不会被静默吞掉」。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildKnowledge, danglingReferences, nodeHref } from './knowledge.mjs';

/** 造一篇文章的最小形态。 */
const post = (id, title, extra = {}) => ({
  id,
  data: {
    title,
    tags: [],
    sources: [],
    prerequisites: [],
    related: [],
    ...extra,
  },
});

const IDS = ['a', 'b', 'c', 'd'];

test('前置与关联被解析成节点，带上标题与链接', () => {
  const index = buildKnowledge([
    post('a.md', '甲', { prerequisites: ['b'], related: ['c'] }),
    post('b.md', '乙'),
    post('c.md', '丙'),
  ]);
  const a = index.get('a');
  assert.deepEqual(
    a.prerequisites.map((n) => n.title),
    ['乙'],
  );
  assert.deepEqual(
    a.related.map((n) => n.title),
    ['丙'],
  );
  assert.equal(a.prerequisites[0].href, '/blog/b/');
});

test('反链是自动算出来的：谁引用了我就出现在我的反链里', () => {
  const index = buildKnowledge([
    post('a.md', '甲', { prerequisites: ['c'] }),
    post('b.md', '乙', { related: ['c'] }),
    post('c.md', '丙'),
  ]);
  const c = index.get('c');
  assert.deepEqual(
    c.backlinks.map((n) => n.title),
    ['乙', '甲'].sort((x, y) => x.localeCompare(y, 'zh-Hans-CN')),
    '前置与关联都算引用来源',
  );
  assert.deepEqual(index.get('a').backlinks, [], '没人引用甲');
});

test('反链不把自己算进去', () => {
  const index = buildKnowledge([post('a.md', '甲', { related: ['a'] })]);
  assert.deepEqual(index.get('a').backlinks, []);
  assert.deepEqual(index.get('a').related, [], '自引用也不该出现在关联里');
});

test('找不到的文章被记进 missing，而不是静默丢弃', () => {
  const index = buildKnowledge([
    post('a.md', '甲', { prerequisites: ['不存在'] }),
  ]);
  assert.deepEqual(index.get('a').prerequisites, []);
  assert.deepEqual(
    index.get('a').missing,
    ['不存在'],
    '静默丢掉的后果是页面上少一个链接，而没有任何提示',
  );
});

test('id 带扩展名与不带扩展名都认', () => {
  const index = buildKnowledge([
    post('a.md', '甲', { prerequisites: ['b.md'] }),
    post('b.md', '乙'),
  ]);
  assert.deepEqual(
    index.get('a').prerequisites.map((n) => n.title),
    ['乙'],
  );
});

test('id 大小写不敏感', () => {
  const index = buildKnowledge([
    post('a.md', '甲', { related: ['B'] }),
    post('b.md', '乙'),
  ]);
  assert.deepEqual(
    index.get('a').related.map((n) => n.title),
    ['乙'],
  );
});

test('来源原样透传，不做解析', () => {
  const sources = [
    {
      title: 'Attention Is All You Need',
      url: 'https://arxiv.org/abs/1706.03762',
    },
    { title: '某篇博客', note: '关于位置编码的直觉' },
  ];
  const index = buildKnowledge([post('a.md', '甲', { sources })]);
  assert.deepEqual(index.get('a').sources, sources);
});

test('没有声明任何字段时不报错，也不编造关系', () => {
  const index = buildKnowledge(
    IDS.map((id) => post(`${id}.md`, id.toUpperCase())),
  );
  for (const id of IDS) {
    const v = index.get(id);
    assert.deepEqual(v.prerequisites, []);
    assert.deepEqual(v.related, []);
    assert.deepEqual(v.backlinks, []);
    assert.deepEqual(v.sources, []);
    assert.deepEqual(v.missing, []);
  }
});

test('反链按标题排序，不随遍历顺序抖动', () => {
  // 顺序若跟着输入顺序走，会随文件系统读到的次序变化 ——
  // 同样的内容两次构建得到不同的页面，diff 全是噪声
  const posts = [
    post('z.md', '丙', { related: ['x'] }),
    post('y.md', '甲', { related: ['x'] }),
    post('w.md', '乙', { related: ['x'] }),
    post('x.md', '丁'),
  ];
  const first = buildKnowledge(posts)
    .get('x')
    .backlinks.map((n) => n.title);
  const second = buildKnowledge([...posts].reverse())
    .get('x')
    .backlinks.map((n) => n.title);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first,
    ['丙', '乙', '甲'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
  );
});

test('danglingReferences 汇总全站悬空引用', () => {
  const out = danglingReferences([
    post('a.md', '甲', { prerequisites: ['b', '没有这个'] }),
    post('b.md', '乙', { related: ['也没有这个'] }),
  ]);
  assert.deepEqual(
    out.map((x) => x.raw).sort(),
    ['没有这个', '也没有这个'].sort(),
  );
  assert.equal(out.find((x) => x.raw === '没有这个').from, 'a.md');
});

test('danglingReferences 不把自引用报成悬空', () => {
  assert.deepEqual(
    danglingReferences([post('a.md', '甲', { related: ['a'] })]),
    [],
  );
});

test('nodeHref 与公开站的文章路由一致', () => {
  assert.equal(nodeHref('thinking.md'), '/blog/thinking/');
  assert.equal(nodeHref('LOVEv1.0.md'), '/blog/LOVEv1.0/');
});
