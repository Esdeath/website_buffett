import { describe, it, expect } from 'vitest';
import { extractWikilinkTargets, buildBacklinks } from './backlinks';

describe('extractWikilinkTargets', () => {
  it('returns canonical keywords (left of pipe), deduped', () => {
    const body = '看[[护城河]],也看[[护城河|moat]],还有[[安全边际|margin]]。';
    expect(extractWikilinkTargets(body).sort()).toEqual(['安全边际', '护城河']);
  });
});

describe('buildBacklinks', () => {
  it('maps a keyword slug to articles that reference it', () => {
    const articles = [
      { slug: 'geico', title: 'GEICO', url: '/articles/company/geico', body: '靠[[护城河]]。' },
      { slug: 'coca-cola', title: '可口可乐', url: '/articles/company/coca-cola', body: '也有[[护城河]]和[[品牌]]。' },
    ];
    // keyword → slug 解析器:这里用最小映射
    const keywordToSlug = new Map([['护城河', 'hu-cheng-he'], ['品牌', 'pin-pai']]);
    const backlinks = buildBacklinks(articles, keywordToSlug);
    expect(backlinks.get('hu-cheng-he')).toEqual([
      { slug: 'geico', title: 'GEICO', url: '/articles/company/geico' },
      { slug: 'coca-cola', title: '可口可乐', url: '/articles/company/coca-cola' },
    ]);
    expect(backlinks.get('pin-pai')).toEqual([
      { slug: 'coca-cola', title: '可口可乐', url: '/articles/company/coca-cola' },
    ]);
  });
});
