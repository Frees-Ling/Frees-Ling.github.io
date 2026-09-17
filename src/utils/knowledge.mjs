// 知识层：节点、来源、前置、关联、反链（KNOW-001）。
//
// ── 它是什么，不是什么 ──
//
// 它是一层**索引**，不是一张图。ADR-019 已经用真实语料实测否掉了
// 节点-连线式的关系图：17 篇文章只有 7 条边、11 个孤立，画出来只能靠
// 编造关系填满画布。所以这里不产出图形，只产出**可导航的结构**：
// 「读这篇之前先读什么」「这篇依据什么」「哪些文章引用了这篇」。
//
// ── 为什么全部来自人工声明 ──
//
// 三个字段（sources / prerequisites / related）都由作者在 frontmatter 里写。
// 不做标签推断，理由与 ADR-019 删除「同分类兜底」是同一条：
// 「都是笔记」不是关联，而一个靠推断填满的列表看起来与真实的一样，
// 读的人无从分辨哪条是作者的意思、哪条是脚本猜的。

/**
 * @typedef {object} KnowledgeNode
 * @property {string} id
 * @property {string} title
 * @property {string} href
 * @property {string[]} tags
 * @property {Date} [updated]
 *
 * @typedef {object} Source
 * @property {string} title
 * @property {string} [url]
 * @property {string} [note]
 *
 * @typedef {object} KnowledgeView
 * @property {KnowledgeNode} node
 * @property {KnowledgeNode[]} prerequisites
 * @property {KnowledgeNode[]} related
 * @property {KnowledgeNode[]} backlinks
 * @property {Source[]} sources
 * @property {string[]} missing
 *
 * @typedef {import('astro:content').CollectionEntry<'posts'>} Post
 */

/** 与 posts-query.ts 保持同一套 href 规则，避免两处漂移。 */
export function nodeHref(id) {
  return `/blog/${id.replace(/\.(md|mdx)$/i, '')}/`;
}

function toNode(post) {
  return {
    id: post.id,
    title: post.data.title,
    href: nodeHref(post.id),
    tags: post.data.tags ?? [],
    updated: post.data.updated,
  };
}

/** 文章 id 的规范化：内容集合的 id 带扩展名，而 frontmatter 里写的是纯名字。 */
function normalizeId(raw) {
  return raw
    .trim()
    .replace(/\.(md|mdx)$/i, '')
    .toLowerCase();
}

/**
 * 建立全站知识索引。
 *
 * **一次遍历建好索引，而不是每个节点各扫一遍全站** ——
 * 后者在 17 篇时看不出差别，在几百篇时是 O(n²)，
 * 而这种「现在够快」的写法最容易在数据变多之后才暴露。
 */
export function buildKnowledge(posts) {
  const byId = new Map();
  for (const post of posts) byId.set(normalizeId(post.id), post);

  // 反链：谁声明了「前置 = 我」或「相关 = 我」
  const backlinks = new Map();
  const addBacklink = (target, from) => {
    if (!backlinks.has(target)) backlinks.set(target, new Set());
    backlinks.get(target).add(from);
  };

  for (const post of posts) {
    const from = normalizeId(post.id);
    for (const dep of [
      ...(post.data.prerequisites ?? []),
      ...(post.data.related ?? []),
    ]) {
      addBacklink(normalizeId(dep), from);
    }
  }

  const resolve = (ids, selfId) => {
    const found = [];
    const missing = [];
    for (const raw of ids) {
      const id = normalizeId(raw);
      if (id === selfId) continue; // 自己引用自己：忽略，不是错误
      const post = byId.get(id);
      if (post) found.push(toNode(post));
      else missing.push(raw);
    }
    return { found, missing };
  };

  const index = new Map();
  for (const post of posts) {
    const id = normalizeId(post.id);

    const pre = resolve(post.data.prerequisites ?? [], id);
    const rel = resolve(post.data.related ?? [], id);

    const back = [...(backlinks.get(id) ?? [])]
      // 不把自己算进自己的反链
      .filter((from) => from !== id)
      .map((from) => toNode(byId.get(from)))
      // 按标题排序：反链的顺序若跟着遍历顺序走，会随文件系统变化而抖动
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));

    index.set(id, {
      node: toNode(post),
      prerequisites: pre.found,
      related: rel.found,
      backlinks: back,
      sources: post.data.sources ?? [],
      // 两个字段的缺失合并报告 —— 上层只关心「有哪些声明落空了」
      missing: [...pre.missing, ...rel.missing],
    });
  }

  return index;
}

/**
 * 取出全站所有悬空引用（声明了但找不到文章）。
 *
 * 单独抽出来是给 `check:content` 用的：一条指向不存在文章的前置知识，
 * 在页面上表现为「少了一个链接」—— 静默得没人会发现，
 * 而那正是「事实来源可追溯」最容易被破坏的方式。
 */
export function danglingReferences(posts) {
  const known = new Set(posts.map((p) => normalizeId(p.id)));
  const out = [];
  for (const post of posts) {
    const self = normalizeId(post.id);
    for (const raw of [
      ...(post.data.prerequisites ?? []),
      ...(post.data.related ?? []),
    ]) {
      const id = normalizeId(raw);
      if (id === self) continue;
      if (!known.has(id)) out.push({ from: post.id, raw });
    }
  }
  return out;
}
