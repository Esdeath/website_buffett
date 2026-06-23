/** 目录名(复数) → type(单数),与 frontmatter type 对齐。 */
const DIR_TO_TYPE: Record<string, string> = {
  'keywords': 'keyword',
  'companies': 'company',
  'industries': 'industry',
  'people': 'person',
  'questions': 'question',
  'timelines': 'timeline',
  'category-overviews': 'category-overview',
};

/** 从词条路径取目录,映射为 type。 */
export function typeFromPath(path: string): string {
  const m = path.match(/articles\/([^/]+)\//);
  if (!m) throw new Error(`无法从路径推断类型: ${path}`);
  const type = DIR_TO_TYPE[m[1]];
  if (!type) throw new Error(`未知文章目录: ${m[1]}`);
  return type;
}

/** 取文件名(不含 .md)作为 slug。 */
export function slugFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

/** 词条路径 → canonical 站内 URL。 */
export function pathToUrl(path: string): string {
  const type = typeFromPath(path);
  const slug = slugFromPath(path);
  return type === 'keyword' ? `/keywords/${slug}` : `/articles/${type}/${slug}`;
}
