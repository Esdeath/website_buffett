import { describe, it, expect } from 'vitest';
import { buildGraph } from './graph';

describe('buildGraph', () => {
  const articles = [
    { slug: 'geico', title: 'GEICO', url: '/articles/company/geico', category: '公司', body: '靠[[护城河]]。' },
    { slug: 'hu-cheng-he', title: '护城河', url: '/keywords/hu-cheng-he', category: '核心哲学', body: '见[[安全边际]]。' },
    { slug: 'an-quan-bian-ji', title: '安全边际', url: '/keywords/an-quan-bian-ji', category: '核心哲学', body: '无链接。' },
  ];
  // 关键词 → 目标文章 slug
  const keywordToSlug = new Map([['护城河', 'hu-cheng-he'], ['安全边际', 'an-quan-bian-ji']]);

  it('creates one node per article with category and indegree', () => {
    const { nodes } = buildGraph(articles, keywordToSlug);
    const moat = nodes.find((n) => n.id === 'hu-cheng-he');
    expect(moat).toMatchObject({ id: 'hu-cheng-he', label: '护城河', category: '核心哲学', url: '/keywords/hu-cheng-he', indegree: 1 });
    expect(nodes.find((n) => n.id === 'an-quan-bian-ji')?.indegree).toBe(1);
    expect(nodes.find((n) => n.id === 'geico')?.indegree).toBe(0);
  });

  it('creates one deduped directed edge per wikilink', () => {
    const { edges } = buildGraph(articles, keywordToSlug);
    expect(edges).toContainEqual({ source: 'geico', target: 'hu-cheng-he' });
    expect(edges).toContainEqual({ source: 'hu-cheng-he', target: 'an-quan-bian-ji' });
    expect(edges).toHaveLength(2);
  });

  it('skips self-links', () => {
    const self = [{ slug: 'x', title: 'X', url: '/keywords/x', category: 'C', body: '[[X词]]' }];
    const { edges } = buildGraph(self, new Map([['X词', 'x']]));
    expect(edges).toHaveLength(0);
  });
});
