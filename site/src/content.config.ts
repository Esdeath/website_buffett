import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: '../buffett/articles' }),
  schema: z.object({
    title: z.string(),
    type: z.string(),
    slug: z.string(),
    category: z.string().optional(), // 不可信,仅占位
    keywords: z.array(z.string()).optional().default([]),
    related: z.array(z.string()).optional().default([]),
    sourceTypes: z.array(z.string()).optional().default([]),
    status: z.string().optional(),
  }),
});

export const collections = { articles };
