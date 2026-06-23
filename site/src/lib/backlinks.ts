const WIKILINK = /\[\[([^\]]+)\]\]/g;

export interface ArticleRef {
  slug: string;
  title: string;
  url: string;
}

interface ArticleInput extends ArticleRef {
  body: string;
}

/** 取正文里所有 [[关键词]] 的 canonical 关键词(管道符左侧),去重。 */
export function extractWikilinkTargets(body: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  WIKILINK.lastIndex = 0;
  while ((m = WIKILINK.exec(body)) !== null) {
    set.add(m[1].split('|')[0].trim());
  }
  return [...set];
}

/** 关键词 slug → 引用它的文章列表(保持输入顺序)。 */
export function buildBacklinks(
  articles: ArticleInput[],
  keywordToSlug: Map<string, string>,
): Map<string, ArticleRef[]> {
  const out = new Map<string, ArticleRef[]>();
  for (const a of articles) {
    for (const keyword of extractWikilinkTargets(a.body)) {
      const slug = keywordToSlug.get(keyword);
      if (!slug) continue; // 未注册关键词在构建期已被 remark 拦截,这里防御性跳过
      if (!out.has(slug)) out.set(slug, []);
      const list = out.get(slug)!;
      if (!list.some((r) => r.slug === a.slug)) {
        list.push({ slug: a.slug, title: a.title, url: a.url });
      }
    }
  }
  return out;
}
