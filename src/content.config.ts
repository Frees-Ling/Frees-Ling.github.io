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
  }),
});

export const collections = { posts };
