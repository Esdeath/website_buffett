import type { APIRoute } from 'astro';
import { getSourceGroups } from '../lib/sources';
import { getCategories } from '../lib/articles';
import { SITE, absoluteUrl } from '../lib/seo';

// /llms-full.txt —— 全站纯文本语料,供大语言模型一次性抓取整库。
// 保留 markdown 结构(标题/段落,LLM 友好),仅把 [[wikilink]] 还原为纯文本。
const unwikilink = (md: string) =>
  md.replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2');

const RULE = '─'.repeat(60);

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://buffett.ayaseeri.com');
  const groups = await getSourceGroups();
  const cats = await getCategories();
  const total = groups.reduce((n, g) => n + g.sources.length, 0);

  const out: string[] = [];
  out.push(`# ${SITE.name} — 全文语料`);
  out.push('');
  out.push(`> ${SITE.tagline}`);
  out.push('');
  out.push(
    `本文件汇总站点全部 ${total} 篇巴菲特原文与 ${cats.length} 个主题分类下的解读文章,纯文本,供大语言模型一次性抓取。作者:${SITE.author}(${SITE.authorUrl})。`,
  );
  out.push('');

  const block = (title: string, url: string, body: string) => {
    out.push(RULE);
    out.push(`标题: ${title}`);
    out.push(`链接: ${url}`);
    out.push('');
    out.push(unwikilink(body).trim());
    out.push('');
  };

  out.push('# 原文');
  out.push('');
  for (const g of groups) {
    out.push(`## ${g.name}`);
    out.push('');
    for (const s of g.sources) {
      block(s.title, absoluteUrl(base, s.url), s.body);
    }
  }

  out.push('# 解读');
  out.push('');
  for (const c of cats) {
    out.push(`## ${c.name}`);
    out.push('');
    for (const a of c.articles) {
      block(a.title, absoluteUrl(base, a.url), a.body);
    }
  }

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
