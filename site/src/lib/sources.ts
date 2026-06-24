import { getCollection } from 'astro:content';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRegistry, buildLookup } from './registry';
import { pathToUrl } from './url';

export interface Source {
  slug: string;
  title: string;
  category: string;
  order: number;
  url: string;
  body: string;
}

/** 原文分类(中文名)→ ASCII group slug。键序即侧栏「原文」区展示顺序,是唯一真相来源。 */
export const SOURCE_GROUP_SLUG: Record<string, string> = {
  '访谈与文章': 'interviews',
  '致股东信': 'letters',
  '致合伙人信': 'partner-letters',
  '股东大会': 'meetings',
};

/** category → 站内 URL 前缀下的 slug 路径。 */
export function sourceUrl(category: string, slug: string): string {
  const group = SOURCE_GROUP_SLUG[category];
  if (!group) throw new Error(`未知原文分类: ${category}`);
  return `/sources/${group}/${slug}`;
}

let _cache: Source[] | null = null;

async function load(): Promise<Source[]> {
  if (_cache) return _cache;
  const collection = await getCollection('sources');
  _cache = collection.map((c: any) => ({
    slug: c.data.slug,
    title: c.data.title,
    category: c.data.category,
    order: c.data.order,
    url: sourceUrl(c.data.category, c.data.slug),
    body: c.body ?? '',
  }));
  return _cache;
}

export async function getSources(): Promise<Source[]> {
  return load();
}

export interface SourceGroup {
  name: string;       // 分类中文名
  groupSlug: string;  // ASCII group slug
  sources: Source[];  // 组内按 order 升序
}

/** 按 category 分组、组内按 order 升序,顺序即 SOURCE_GROUP_SLUG 键序。侧栏「原文」区用。 */
export async function getSourceGroups(): Promise<SourceGroup[]> {
  const sources = await load();
  const order = Object.keys(SOURCE_GROUP_SLUG);
  const byCat = new Map<string, Source[]>();
  for (const s of sources) {
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category)!.push(s);
  }
  return order
    .filter((name) => byCat.has(name))
    .map((name) => ({
      name,
      groupSlug: SOURCE_GROUP_SLUG[name],
      sources: byCat.get(name)!.slice().sort((a, b) => a.order - b.order),
    }));
}

// ---- 原文右栏用的派生数据 ----

export interface KeywordRef {
  name: string; // 关键词 canonical 名
  url: string;  // 解读文章 URL
}

export interface SourceNav {
  prev: { title: string; url: string } | null;
  next: { title: string; url: string } | null;
}

// 注册表 term(关键词/别名) → {url, keyword},长词在前,供正文扫描复用。
let _terms: { term: string; url: string; keyword: string }[] | null = null;
function registryTerms() {
  if (_terms) return _terms;
  const registryPath = fileURLToPath(new URL('../../../docs/keyword-registry.md', import.meta.url));
  const entries = parseRegistry(readFileSync(registryPath, 'utf8'));
  const lookup = buildLookup(entries);
  _terms = [...lookup.entries()]
    .map(([term, e]) => ({ term, url: pathToUrl(e.path), keyword: e.keyword }))
    .sort((a, b) => b.term.length - a.term.length);
  return _terms;
}

/** 扫描原文 body,返回本篇涉及的关键词(去重、按正文首次出现顺序)。与正文自动链接同源。 */
export async function getSourceKeywords(slug: string): Promise<KeywordRef[]> {
  const sources = await load();
  const src = sources.find((s) => s.slug === slug);
  if (!src) return [];
  const body = src.body;
  const found = new Map<string, { name: string; url: string; at: number }>();
  for (const { term, url, keyword } of registryTerms()) {
    if (found.has(url)) continue; // 每个词条只记一次
    const at = body.indexOf(term);
    if (at !== -1) found.set(url, { name: keyword, url, at });
  }
  return [...found.values()].sort((a, b) => a.at - b.at).map(({ name, url }) => ({ name, url }));
}

/** 同分类内按 order 的上一篇/下一篇。 */
export async function getSourceNav(slug: string): Promise<SourceNav> {
  const groups = await getSourceGroups();
  for (const g of groups) {
    const i = g.sources.findIndex((s) => s.slug === slug);
    if (i === -1) continue;
    const prev = i > 0 ? g.sources[i - 1] : null;
    const next = i < g.sources.length - 1 ? g.sources[i + 1] : null;
    return {
      prev: prev ? { title: prev.title, url: prev.url } : null,
      next: next ? { title: next.title, url: next.url } : null,
    };
  }
  return { prev: null, next: null };
}
