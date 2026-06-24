import { parseRegistry, type KeywordEntry } from './registry';
import { pathToUrl, slugFromPath } from './url';

export interface Article {
  slug: string;
  type: string;
  title: string;
  category: string;
  url: string;
  body: string;
  keywords: string[];
  related: string[];
  sourceTypes: string[];
}

// type → 兜底分类标签。覆盖全部 7 个 type,确保不在 registry 的文章也落到中文桶
// (尤其 company:dexter-shoe 不在 registry,无此键会泄漏成英文 "company")。
const TYPE_CATEGORY: Record<string, string> = {
  'category-overview': '分类总论',
  'question': '问题',
  'timeline': '时间线',
  'company': '公司',
  'person': '人物',
  'industry': '行业',
  'keyword': '核心哲学', // 兜底用;正常 121 篇 keyword 全部命中 registry(校验脚本强制)
};

interface RawEntry {
  filePath: string; // glob loader 提供的完整相对路径,形如 ../buffett/articles/keywords/hu-cheng-he.md
  data: {
    title: string;
    type: string;
    slug?: string;
    keywords?: string[];
    related?: string[];
    sourceTypes?: string[];
  };
  body: string;
}

/** 把一条 collection 记录 + registry 拼成统一文章模型。
 *  用 entry.filePath(完整路径)推 type/url/slug,registry 按完整 path 精确匹配——
 *  既不依赖 glob loader 的 id 格式,也避免跨 type 同名 slug 串味。 */
export function assembleArticle(raw: RawEntry, entries: KeywordEntry[]): Article {
  const path = raw.filePath.replace(/^(\.\.\/)+/, ''); // → buffett/articles/.../x.md
  const slug = slugFromPath(path);
  const reg = entries.find((e) => e.path === path);
  const url = pathToUrl(path);
  const category = reg?.category ?? TYPE_CATEGORY[raw.data.type] ?? raw.data.type;
  return {
    slug,
    type: raw.data.type,
    title: raw.data.title,
    category,
    url,
    body: raw.body ?? '',
    keywords: raw.data.keywords ?? [],
    related: raw.data.related ?? [],
    sourceTypes: raw.data.sourceTypes ?? [],
  };
}

import { getCollection } from 'astro:content';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLookup } from './registry';
import { buildBacklinks, type ArticleRef } from './backlinks';
import { buildGraph, type GraphNode, type GraphEdge } from './graph';

let _cache: {
  articles: Article[];
  entries: KeywordEntry[];
  keywordToSlug: Map<string, string>;
  backlinks: Map<string, ArticleRef[]>;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
} | null = null;

async function load() {
  if (_cache) return _cache;
  const registryPath = fileURLToPath(new URL('../../../docs/keyword-registry.md', import.meta.url));
  const entries = parseRegistry(readFileSync(registryPath, 'utf8'));
  const collection = await getCollection('articles');
  const articles = collection.map((c: any) =>
    assembleArticle({ filePath: c.filePath, data: c.data, body: c.body }, entries),
  );
  // 关键词/别名 → 该关键词 canonical 文章 slug
  const lookup = buildLookup(entries);
  const keywordToSlug = new Map<string, string>();
  for (const [term, e] of lookup) keywordToSlug.set(term, e.slug);
  const backlinks = buildBacklinks(
    articles.map((a) => ({ slug: a.slug, title: a.title, url: a.url, body: a.body })),
    keywordToSlug,
  );
  const graph = buildGraph(
    articles.map((a) => ({ slug: a.slug, title: a.title, url: a.url, category: a.category, body: a.body })),
    keywordToSlug,
  );
  _cache = { articles, entries, keywordToSlug, backlinks, graph };
  return _cache;
}

export async function getArticles(): Promise<Article[]> {
  return (await load()).articles;
}

export interface RelatedRef {
  name: string;       // 展示用中文名(关键词 canonical 名或文章标题)
  url: string | null; // 站内 URL;命不中注册表/文章时为 null,原样展示不生成链接
}

/** related 项(关键词 slug、文章 slug 或中文名)→ {中文名, 站内URL}。
 *  侧栏「关联」用,避免直接渲染拼音 slug。 */
export async function resolveRelated(slugs: string[]): Promise<RelatedRef[]> {
  const { entries, articles } = await load();
  const byKwSlug = new Map(entries.map((e) => [e.slug, e]));
  const byName = buildLookup(entries); // 关键词/别名(中文)→ 条目
  const byArtSlug = new Map(articles.map((a) => [a.slug, a]));
  return slugs.map((s) => {
    const e = byKwSlug.get(s) ?? byName.get(s);
    if (e) return { name: e.keyword, url: pathToUrl(e.path) };
    const a = byArtSlug.get(s);
    if (a) return { name: a.title, url: a.url };
    return { name: s, url: null };
  });
}

/** 分类中文名 → ASCII slug(分类页 URL 用)。键的顺序即首页/侧栏的展示顺序,是唯一真相来源。 */
export const CATEGORY_SLUG: Record<string, string> = {
  '核心哲学': 'he-xin-zhe-xue',
  '投资理念': 'tou-zi-li-nian',
  '企业经营': 'qi-ye-jing-ying',
  '财务指标': 'cai-wu-zhi-biao',
  '品格与心性': 'pin-ge-yu-xin-xing',
  '公司': 'gong-si',
  '行业': 'hang-ye',
  '人物': 'ren-wu',
  '保险、浮存金与风险': 'bao-xian-fu-cun-jin-yu-feng-xian',
  '市场周期与风险控制': 'shi-chang-zhou-qi-yu-feng-xian-kong-zhi',
  '宏观经济与投资环境': 'hong-guan-jing-ji-yu-tou-zi-huan-jing',
  '分类总论': 'fen-lei-zong-lun',
  '问题': 'wen-ti',
  '时间线': 'shi-jian-xian',
};

export async function getCategories(): Promise<{ name: string; slug: string; articles: Article[] }[]> {
  const { articles } = await load();
  const order = Object.keys(CATEGORY_SLUG); // 展示顺序即 CATEGORY_SLUG 键序
  const byCat = new Map<string, Article[]>();
  for (const a of articles) {
    if (!byCat.has(a.category)) byCat.set(a.category, []);
    byCat.get(a.category)!.push(a);
  }
  return order.filter((c) => byCat.has(c)).map((name) => ({ name, slug: CATEGORY_SLUG[name], articles: byCat.get(name)! }));
}

export async function getBacklinks(slug: string): Promise<ArticleRef[]> {
  return (await load()).backlinks.get(slug) ?? [];
}

export async function getGraph() {
  return (await load()).graph;
}
