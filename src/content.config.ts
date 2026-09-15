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
    lang: z.string().optional().default('zh-CN'),
    featured: z.boolean().optional().default(false),
  }),
});

export const collections = { posts };
