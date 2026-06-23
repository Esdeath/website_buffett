export interface KeywordEntry {
  keyword: string;
  slug: string;
  category: string;
  path: string;       // 仓库根相对路径,如 buffett/articles/keywords/hu-cheng-he.md
  aliases: string[];
  status: string;
}

/** 解析 docs/keyword-registry.md 的 Markdown 表格为条目数组。 */
export function parseRegistry(markdown: string): KeywordEntry[] {
  const entries: KeywordEntry[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const [keyword, slug, category, path, aliasCell, status] = cells;
    if (keyword === '关键词' || /^-+$/.test(keyword)) continue; // 表头/分隔行
    const aliases = aliasCell
      .split(/[,，]/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    entries.push({ keyword, slug, category, path, aliases, status });
  }
  return entries;
}

/** 构建「关键词或别名 → 条目」查找表。 */
export function buildLookup(entries: KeywordEntry[]): Map<string, KeywordEntry> {
  const map = new Map<string, KeywordEntry>();
  for (const e of entries) {
    map.set(e.keyword, e);
    for (const alias of e.aliases) map.set(alias, e);
  }
  return map;
}
