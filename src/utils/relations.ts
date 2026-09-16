/**
 * 文章关系 —— 「参见」与主题总览的共同数据源。
 *
 * 为什么必须有这一层：如果没有它，「参见」和主题总览就是两个各算各的功能，
 * 迟早会给出互相矛盾的答案。现在两者都读同一份 `buildRelations` 的结果 ——
 * 卡片上的「参见」是它的局部视图，主题总览是同一份数据的聚合视图。
 *
 * 关系强度只用**真实信号**：共享标签，且按稀有度加权。
 * 刻意**不**使用两个看似合理、实则虚假的信号：
 *   · 同分类 —— 17 篇里 13 篇是「笔记」，用它兜底会让每篇「参见」都列出其余全部；
 *   · 时间接近 —— 两篇同月写的文章未必有关系。
 *
 * 这里曾有一个 `buildGraph`（构建期算坐标、渲染静态 SVG 的关系网络图），
 * 已删除：实测该语料画不出有结构的图（见 buildTopicOverview 的说明）。
 * 保留一段产不出有效结果的实现，只会诱使后来者真的去画它。
 */

import { normalizeTags, type Post } from './posts';

export interface Relation {
  post: Post;
  score: number;
  /** 实际共享的标签，按稀有度从高到低 —— 直接显示在「参见」里 */
  sharedTags: string[];
}

export interface Topic {
  name: string;
  count: number;
  posts: Post[];
  /** 与它共同出现过的其他主题，按共现次数排序 */
  related: Array<{ name: string; count: number }>;
}

/** 全站标签频次，用于给稀有标签更高权重。 */
function tagFrequency(posts: Post[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const post of posts) {
    for (const tag of new Set(normalizeTags(post.data.tags))) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * 共享标签的权重按稀有度倒数。
 *
 * 全站 12 篇文章都带 `YOLO` 时，共享它几乎不说明任何关系；
 * 只有两篇共享 `线性代数` 时，那才是一条真的线索。
 * 这就是「参见」与「随机推荐」的区别。
 */
function tagWeight(tag: string, freq: Map<string, number>): number {
  return 1 / (freq.get(tag) ?? 1);
}

/**
 * 每篇文章的「参见」列表，按关系强度排序。
 *
 * 只认真实共享的标签。这里曾有一个「无共享标签时按同分类给 0.05 兜底」的
 * 分支，实测后果很糟：17 篇里 13 篇分类是「笔记」，
 * 于是每张卡片的「参见」都把其余 12 篇全列了出来 ——
 * 「都是笔记」不是关联，把它算作关联等于把噪音包装成线索。
 */
export function buildRelations(posts: Post[]): Map<string, Relation[]> {
  const freq = tagFrequency(posts);
  const tagsOf = new Map(posts.map((p) => [p.id, normalizeTags(p.data.tags)]));
  const result = new Map<string, Relation[]>();

  for (const post of posts) {
    const own = tagsOf.get(post.id) ?? [];
    const relations: Relation[] = [];

    for (const other of posts) {
      if (other.id === post.id) continue;
      const theirs = tagsOf.get(other.id) ?? [];
      const shared = own.filter((tag) => theirs.includes(tag));
      if (shared.length === 0) continue;

      relations.push({
        post: other,
        score: shared.reduce((sum, tag) => sum + tagWeight(tag, freq), 0),
        sharedTags: [...shared].sort(
          (a, b) => tagWeight(b, freq) - tagWeight(a, freq),
        ),
      });
    }

    relations.sort(
      (a, b) => b.score - a.score || a.post.id.localeCompare(b.post.id),
    );
    result.set(post.id, relations);
  }

  return result;
}

/** 供列表与详情页使用的「参见」——取排名靠前的若干条。 */
export function getRelated(
  post: Post,
  relations: Map<string, Relation[]>,
  limit = 4,
): Relation[] {
  return (relations.get(post.id) ?? []).slice(0, limit);
}

/**
 * 主题总览 —— 知识地图在当前语料规模下的**诚实形态**。
 *
 * 为什么不画网络图：2026-09-16 用真实数据实测，
 *   · 文章层：17 个节点只有 7 条边，11 个孤立；唯一成簇的 4 篇 YOLO 文章
 *     是权重完全相同的完全图 —— 画出来是一个没有结构的十字。
 *   · 标签层：34 个标签里 31 个只出现一次，33 对共现里绝大多数权重为 1。
 * 两种画法都只能靠**编造**关系来填满画布，那就是装饰而非导航。
 *
 * 真正成立的事实是「语料覆盖了哪些主题、每个主题有几篇」——
 * 这才是可用的知识导航，而且不需要假装存在一张网。
 * 参见 `docs/visual-direction.md` 关于关系图何时才成立的扩展条件。
 */
export function buildTopicOverview(posts: Post[]): Topic[] {
  const byTopic = new Map<string, Post[]>();
  for (const post of posts) {
    for (const tag of new Set(normalizeTags(post.data.tags))) {
      byTopic.set(tag, [...(byTopic.get(tag) ?? []), post]);
    }
  }

  const topics: Topic[] = [];
  for (const [name, members] of byTopic) {
    // 与它共同出现在同一篇文章里的其他主题
    const co = new Map<string, number>();
    for (const post of members) {
      for (const tag of new Set(normalizeTags(post.data.tags))) {
        if (tag === name) continue;
        co.set(tag, (co.get(tag) ?? 0) + 1);
      }
    }
    topics.push({
      name,
      count: members.length,
      posts: members.sort(
        (a, b) => b.data.published.getTime() - a.data.published.getTime(),
      ),
      related: [...co]
        .map(([n, count]) => ({ name: n, count }))
        .sort(
          (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
        ),
    });
  }

  // 条目多的主题在前；同数量按名称，保证构建可复现
  return topics.sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
  );
}
