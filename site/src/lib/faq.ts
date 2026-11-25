/**
 * 从解读文章正文里提取「常见问题」小节，生成 FAQPage 数据。
 *
 * 站点里存在两种写法：
 *   1. 编号问答：`1. 问题？答案……`
 *   2. 小标题问答：`### 问题？` 后跟一段答案
 *
 * 只用页面里真实存在的文字，不另写问答；提取不到 3 条就不输出 FAQPage。
 */

export interface FaqItem {
  question: string;
  answer: string;
}

function cleanInline(value: string): string {
  return value
    // [[关键词]] / [[关键词|显示文字]] → 显示文字或关键词
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // 行内链接 [文字](url) → 文字
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitNumbered(line: string): FaqItem | null {
  const body = line.replace(/^\d+\.\s*/, '').trim();
  const match = /^(.*?[？?])\s*(.+)$/.exec(body);
  if (!match) return null;
  const question = cleanInline(match[1]);
  const answer = cleanInline(match[2]);
  if (question.length < 6 || answer.length < 10) return null;
  return { question, answer };
}

export function extractFaq(body: string, limit = 10): FaqItem[] {
  const lines = String(body || '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s*常见问题\s*$/.test(line.trim()));
  if (start < 0) return [];

  const items: FaqItem[] = [];
  let heading: string | null = null;
  let paragraph: string[] = [];

  const flushHeading = () => {
    if (heading) {
      const answer = cleanInline(paragraph.join(' '));
      if (answer.length >= 10) items.push({ question: cleanInline(heading), answer });
    }
    heading = null;
    paragraph = [];
  };

  for (let index = start + 1; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (/^##\s+/.test(line)) break; // 下一个同级标题：本节结束
    if (!line) {
      if (heading && paragraph.length > 0) flushHeading();
      continue;
    }
    const numbered = /^\d+\.\s+/.test(line);
    if (numbered) {
      flushHeading();
      const item = splitNumbered(line);
      if (item) items.push(item);
      continue;
    }
    const sub = /^###\s+(.+)$/.exec(line);
    if (sub) {
      flushHeading();
      heading = sub[1].trim();
      continue;
    }
    if (heading) paragraph.push(line);
    if (items.length >= limit) break;
  }
  flushHeading();

  return items
    .filter((item) => item.question.length >= 6 && item.answer.length >= 10)
    .slice(0, limit);
}

export function buildFaqLd(items: FaqItem[], url: string): Record<string, unknown> | null {
  if (items.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    url,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
