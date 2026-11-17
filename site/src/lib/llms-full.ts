// 把 17MB 的整站语料拆成单卷 ≤1.5MB 的纯文本，供 AI 抓取端逐卷取用。
// 单文件过大时抓取方会直接截断，索引页只负责列卷和篇数。
import { getSourceGroups } from './sources';
import { getCategories } from './articles';
import { SITE, absoluteUrl } from './seo';

const RULE = '─'.repeat(60);
const MAX_VOLUME_BYTES = 1_500_000;

export interface LlmsEntry {
  title: string;
  url: string;
  body: string;
  section?: string;
}

export interface LlmsVolume {
  id: string;
  title: string;
  count: number;
  body: string;
}

const cleanMarkdown = (md: string) =>
  md
    .replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2')
    .replace(/^<a id="qa-(?:source-)?q\d{3}-(?:start|end)"><\/a>\s*$/gm, '');

const sizeOf = (value: string) => new TextEncoder().encode(value).length;

/** 按累计字节数切卷，不拆单篇；单篇超限时独占一卷。 */
function chunkBySize<T>(items: T[], measure: (item: T) => number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = measure(item);
    if (current.length > 0 && bytes + size > MAX_VOLUME_BYTES) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function renderVolume(base: URL, volume: { title: string; entries: LlmsEntry[] }): string {
  const out: string[] = [];
  out.push(`# ${SITE.name} — ${volume.title}`);
  out.push('');
  out.push(`> ${SITE.tagline}`);
  out.push('');
  out.push(`本卷 ${volume.entries.length} 篇，纯文本，保留标题与段落结构，链接为原文地址。`);
  out.push('');
  let section = '';
  for (const entry of volume.entries) {
    if (entry.section && entry.section !== section) {
      section = entry.section;
      out.push(`## ${section}`);
      out.push('');
    }
    out.push(RULE);
    out.push(`标题: ${entry.title}`);
    out.push(`链接: ${absoluteUrl(base, entry.url)}`);
    out.push('');
    out.push(cleanMarkdown(entry.body).trim());
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

export async function buildLlmsVolumes(base: URL): Promise<LlmsVolume[]> {
  const groups = await getSourceGroups();
  const cats = await getCategories();
  const volumes: LlmsVolume[] = [];

  for (const group of groups) {
    const chunks = chunkBySize(group.sources, (source) => sizeOf(source.body) + 200);
    chunks.forEach((sources, index) => {
      const suffix = chunks.length > 1 ? `（${index + 1}/${chunks.length} 卷）` : '';
      const title = `${group.name}${suffix}`;
      volumes.push({
        id: `sources-${group.groupSlug}-${index + 1}`,
        title,
        count: sources.length,
        body: renderVolume(base, {
          title,
          entries: sources.map((source) => ({
            title: source.title,
            url: source.url,
            body: source.body,
          })),
        }),
      });
    });
  }

  // 解读文章按分类拼卷，保留分类小标题，不把同一分类拆散。
  const blocks = cats.map((category) => ({
    section: category.name,
    articles: category.articles,
    bytes: category.articles.reduce((sum, article) => sum + sizeOf(article.body) + 200, 0),
  }));
  const articleChunks: typeof blocks[] = [];
  let current: typeof blocks = [];
  let bytes = 0;
  for (const block of blocks) {
    if (current.length > 0 && bytes + block.bytes > MAX_VOLUME_BYTES) {
      articleChunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(block);
    bytes += block.bytes;
  }
  if (current.length > 0) articleChunks.push(current);

  articleChunks.forEach((chunk, index) => {
    const suffix = articleChunks.length > 1 ? `（${index + 1}/${articleChunks.length} 卷）` : '';
    const title = `解读文章${suffix}`;
    const entries = chunk.flatMap((block) =>
      block.articles.map((article) => ({
        title: article.title,
        url: article.url,
        body: article.body,
        section: block.section,
      })),
    );
    volumes.push({
      id: `articles-${index + 1}`,
      title,
      count: entries.length,
      body: renderVolume(base, { title, entries }),
    });
  });

  return volumes;
}

/** 分卷索引：AI 先读这张目录，再按需取卷，避免一次拉 17MB。 */
export function renderLlmsIndex(base: URL, volumes: LlmsVolume[]): string {
  const sources = volumes.filter((volume) => volume.id.startsWith('sources-'));
  const articles = volumes.filter((volume) => volume.id.startsWith('articles-'));
  const total = volumes.reduce((sum, volume) => sum + volume.count, 0);
  const out: string[] = [];
  out.push(`# ${SITE.name} — 正文与资料来源汇编（分卷索引）`);
  out.push('');
  out.push(`> ${SITE.tagline}`);
  out.push('');
  out.push(`整站正文共 ${total} 篇，按分卷提供纯文本，单卷不超过约 1.5MB；整站抓取时逐卷取用。`);
  out.push('');
  out.push('## 原文');
  out.push('');
  for (const volume of sources) {
    out.push(`- [${volume.title}](${absoluteUrl(base, `/llms-full/${volume.id}.txt`)}): ${volume.count} 篇`);
  }
  out.push('');
  out.push('## 解读');
  out.push('');
  for (const volume of articles) {
    out.push(`- [${volume.title}](${absoluteUrl(base, `/llms-full/${volume.id}.txt`)}): ${volume.count} 篇`);
  }
  out.push('');
  out.push('## 其他');
  out.push('');
  out.push(`- [站点索引 llms.txt](${absoluteUrl(base, '/llms.txt')}): 全部页面链接与专题书入口`);
  out.push(`- [站点地图](${absoluteUrl(base, '/sitemap-index.xml')})`);
  out.push('');
  return out.join('\n');
}
