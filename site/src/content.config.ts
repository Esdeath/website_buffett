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

// 《巴菲特问答录》一问一文件。part/chapter/movement 暂时兼容数字编号与稳定 ID，
// 装配层会统一成 manifest 中的 part-N/chapter-N/movement-N。
const qaBookQuestions = defineCollection({
  loader: glob({
    pattern: 'questions/**/*.md',
    base: '../buffett/books/buffett-wenda-lu',
  }),
  schema: z.object({
    id: z.string().regex(/^q\d{3}$/),
    title: z.string().min(1),
    sourceQuestion: z.string().min(1),
    part: z.union([z.string(), z.number().int().positive()]),
    chapter: z.union([z.string(), z.number().int().positive()]),
    movement: z.union([z.string(), z.number().int().positive()]),
    order: z.number().int().min(1).max(30),
    domain: z.enum(['investment-business', 'life-society', 'investment', 'life']),
    sourceId: z.string().min(1),
    sourceStartAnchor: z.string().min(1),
    sourceEndAnchor: z.string().min(1),
    sourceHash: z.string().min(1),
    externalLocator: z.union([
      z.string().min(1),
      z.object({
        url: z.string().url().optional(),
        label: z.string().optional(),
        year: z.number().int().optional(),
      }).refine((value) => Boolean(value.url || value.label), 'externalLocator 需要 url 或 label'),
    ]),
    speakers: z.array(z.string().min(1)).min(1),
    keywords: z.array(z.string().min(1)).min(1),
    editorialRole: z.enum(['reader-problem', 'core-principle', 'boundary-counterexample', 'case-action']),
    chapterBeat: z.enum(['opening', 'development', 'stress-test', 'bridge']),
    selectionScore: z.number().min(7).max(10),
    status: z.enum(['draft', 'reviewed', 'verified', 'published']),
  }),
});

export const collections = { articles, sources, qaBookQuestions };
