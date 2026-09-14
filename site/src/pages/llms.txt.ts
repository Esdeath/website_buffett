import type { APIRoute } from 'astro';
import { getSourceGroups } from '../lib/sources';
import { getCategories } from '../lib/articles';
import { loadQaManifest } from '../lib/qa-book';
import { SITE, absoluteUrl } from '../lib/seo';

// /llms.txt —— 面向 AI 引擎的站点索引(llmstxt.org 格式)。
// 构建期生成,随内容自动同步;列出全部原文链接 + 解读分类入口 + 全文语料指针。
export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://buffett.ayaseeri.com');
  const groups = await getSourceGroups();
  const cats = await getCategories();
  const total = groups.reduce((n, g) => n + g.sources.length, 0);
  const qaManifest = loadQaManifest();

  const out: string[] = [];
  out.push(`# ${SITE.name}`);
  out.push('');
  out.push(
    `> ${SITE.tagline}汇集 ${total} 篇巴菲特原文(致股东信、致合伙人信、访谈与股东大会)与 ${cats.length} 个主题解读,先原文后观点,每条解读都标注原文出处。`,
  );
  out.push('');
  out.push(`作者:${SITE.author}(${SITE.authorUrl})。语言:简体中文。`);
  out.push('');

  out.push('## 专题书');
  out.push('');
  out.push(`- [巴菲特问答录](${absoluteUrl(base, '/books/buffett-wenda-lu/')}): ${qaManifest.questionCount} 个真实问答，从一笔投资问到怎样过一生`);
  out.push(`- [巴菲特问答录 Markdown](${absoluteUrl(base, '/books/buffett-wenda-lu.md')}): 完整可下载书稿`);
  out.push('');

  out.push('## 原文');
  out.push('');
  for (const g of groups) {
    out.push(`### ${g.name}`);
    out.push('');
    for (const s of g.sources) {
      out.push(`- [${s.title}](${absoluteUrl(base, s.url)})`);
    }
    out.push('');
  }

  out.push('## 解读(按主题分类)');
  out.push('');
  for (const c of cats) {
    out.push(`- [${c.name}](${absoluteUrl(base, `/categories/${c.slug}`)}): ${c.articles.length} 篇`);
  }
  out.push('');

  out.push('## 完整语料与资源');
  out.push('');
  out.push(
    `- [全文语料 llms-full.txt](${absoluteUrl(base, '/llms-full.txt')}): 全部原文与解读的纯文本汇总,供一次性抓取`,
  );
  out.push(`- [站点地图](${absoluteUrl(base, '/sitemap-index.xml')})`);
  out.push('');

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
