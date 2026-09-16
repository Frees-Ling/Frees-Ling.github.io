/**
 * 栏目（section）定义 —— 文章归入哪个栏目的**唯一真相源**。
 *
 * 为什么需要这个文件：`/notes/` 曾经用一篇文章 id 白名单
 * （`['lovev10','meeting','thinking','index']`），`/research/` 用一个标签白名单，
 * 两者都写在页面里。后果是**新增文章不会出现在任何栏目页**，
 * 而且白名单里的 id 写错（如 `lovev10` 对应的是 `LOVEv1.0`）不会有任何提示。
 *
 * 现在的归属规则有两条，按优先级：
 *   ① 文章 frontmatter 显式写 `section: <id>` —— **人工字段优先**，
 *      作者意图覆盖一切推断。写错的值由 `scripts/check-content.mjs` 拦下。
 *   ② 否则按 `categories` / `tags` 推断。
 *
 * 新增文章只要带上对应标签就会自动出现，不需要改这个文件。
 *
 * 纯数据、无 import —— 匹配逻辑在 `src/utils/posts-query.ts`，
 * 这样数据与算法分离，且不会产生循环依赖。
 */

export interface Section {
  /** 稳定标识，用于 frontmatter 的 `section:` 字段 */
  id: string;
  /** 公开路由。必须与 `src/pages/` 下的真实页面一致，由 check-content 校验 */
  route: string;
  /** 编辑语气的大写标签，与 FIELD LOG 命名一致 */
  latin: string;
  label: string;
  /** 归一化后的分类名（见 utils/posts.ts 的 normalizeCategory） */
  categories: string[];
  /** 文章 frontmatter 里的标签，注意全角逗号会被 normalizeTags 拆开 */
  tags: string[];
}

export const sections: Section[] = [
  {
    id: 'research',
    // 标签取自 17 篇的真实分布，不是设想出来的分类体系。
    // 标签是「作者已经写了什么」的记录，栏目只是把它们聚合起来。
    route: '/research/',
    latin: 'RESEARCH',
    label: '研究',
    categories: [],
    tags: [
      'AI',
      'Transformer',
      '机器学习',
      '线性代数',
      'YOLO',
      '计算机视觉',
      '数据标注',
      '训练问题',
      '训练配置',
      '反馈图表解析',
      'Unitree Go2',
      '机器人',
      '开发演示',
      'OpenAI',
      '本地化部署',
      '构建AI',
      '入门指南',
    ],
  },
  {
    id: 'notes',
    route: '/notes/',
    latin: 'NOTES',
    label: '随笔',
    // 分类也是归属依据：`thinking` 没有标签但分类落在随笔，
    // 只按标签匹配会让这篇 3800 字的文章从所有栏目页消失。
    categories: ['随笔'],
    tags: ['随笔', 'LOVE', 'Meeting', 'Meaning'],
  },
];

export function sectionById(id: string): Section | undefined {
  return sections.find((section) => section.id === id);
}

/** 供 check-content 校验 frontmatter 里的 `section:` 值是否合法。 */
export const sectionIds: string[] = sections.map((section) => section.id);
