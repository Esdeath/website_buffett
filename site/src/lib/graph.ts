import { extractWikilinkTargets } from './backlinks';

export interface GraphNode {
  id: string;        // slug
  label: string;     // 标题
  category: string;
  url: string;
  indegree: number;
}
export interface GraphEdge {
  source: string;
  target: string;
}
interface ArticleInput {
  slug: string;
  title: string;
  url: string;
  category: string;
  body: string;
}

export function buildGraph(
  articles: ArticleInput[],
  keywordToSlug: Map<string, string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const known = new Set(articles.map((a) => a.slug));
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const indegree = new Map<string, number>();

  for (const a of articles) {
    for (const keyword of extractWikilinkTargets(a.body)) {
      const target = keywordToSlug.get(keyword);
      if (!target || !known.has(target) || target === a.slug) continue;
      const key = `${a.slug}->${target}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ source: a.slug, target });
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }

  const nodes: GraphNode[] = articles.map((a) => ({
    id: a.slug,
    label: a.title,
    category: a.category,
    url: a.url,
    indegree: indegree.get(a.slug) ?? 0,
  }));

  return { nodes, edges };
}
