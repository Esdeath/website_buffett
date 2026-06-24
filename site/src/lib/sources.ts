import { getCollection } from 'astro:content';

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
