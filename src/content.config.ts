import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    description: z.string().default(''),
    image: z.string().optional().default(''),
    tags: z.array(z.string()).default([]),
    category: z.string().optional().default('随笔'),
    draft: z.boolean().default(false),
    /**
     * 预留：全站目前只有 zh-CN 一个语种，也没有按语种分路由。
     * 保留字段是为了将来加语言时不必改 17 篇的 frontmatter，
     * 但它现在**不影响任何渲染** —— 由 check-content 校验取值合法性。
     */
    lang: z.string().optional().default('zh-CN'),
    /** 人工置顶：首页与栏目页优先挑 featured 的文章，不足再按时间补。 */
    featured: z.boolean().optional().default(false),
    /**
     * 栏目归属的**人工覆盖**字段。为空时按分类/标签推断（见 utils/posts-query.ts）。
     * 一旦填写即以它为准 —— 作者意图优先于标签推断。
     * 合法取值是 src/data/sections.ts 里的 id，由 check-content 校验。
     */
    section: z.string().optional(),

    // ── 知识层（KNOW-001）──
    //
    // 三个字段**全是可选的**，因为「一条笔记是不是某个知识节点的前置」
    // 是一个人的判断，不该由脚本推断。留空时什么也不渲染，
    // 而不是退回到「按标签猜」—— 那种猜测 ADR-019 已经用真实数据否掉过。

    /**
     * 事实来源：这条结论依据什么。
     *
     * **可追溯是这一层的核心要求**：有来源的断言与没来源的断言
     * 不该长得一样。留空表示「这是个人经验或推理」，不是「忘了填」——
     * 两者在页面上都不显示，但作者自己清楚。
     */
    sources: z
      .array(
        z.object({
          title: z.string(),
          url: z.string().url().optional(),
          note: z.string().optional(),
        }),
      )
      .optional()
      .default([]),

    /**
     * 前置知识：读这篇之前应当先读哪些。值是别的文章的 id
     * （`src/content/posts/` 下的文件名去掉扩展名）。
     *
     * 填错的 id 会被 `check:content` 报出来 —— 一条指向不存在文章的前置，
     * 在页面上表现为「少了一个链接」，静默得没人会发现。
     */
    prerequisites: z.array(z.string()).optional().default([]),

    /**
     * 显式关联：与哪些文章相关。人工指定，**优先于**按标签推断的「参见」。
     * 与 `prerequisites` 的区别是方向：那个是「先读什么」，这个是「还看什么」。
     */
    related: z.array(z.string()).optional().default([]),
  }),
});

export const collections = { posts };
