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

// 原文素材:致股东信/合伙人信(berkshire)、访谈与文章(interview)、股东大会(shareholders)。
// 与 articles 分属不同 collection;无 type,按 category 分组、order 排序。
const sources = defineCollection({
  loader: glob({
    pattern: '{berkshire,interview,shareholders}/**/*.md',
    base: '../buffett',
  }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    category: z.string(),
    order: z.number(),
    description: z.string().optional(),
    // 原文已在 frontmatter 手写 SEO 文案;全部 284 篇齐备,优先于正文摘要。
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
  }),
});

export const collections = { articles, sources };
