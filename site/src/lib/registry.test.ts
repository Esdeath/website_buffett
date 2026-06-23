import { describe, it, expect } from 'vitest';
import { parseRegistry, buildLookup } from './registry';

const SAMPLE = `# 关键词注册表

| 关键词 | slug | 分类 | 词条路径 | 别名 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 护城河 | hu-cheng-he | 核心哲学 | buffett/articles/keywords/hu-cheng-he.md | Economic Moat, 经济护城河 | 已核验 |
| GEICO | geico | 公司 | buffett/articles/companies/geico.md | 盖可保险 | 初稿完成 |
`;

describe('parseRegistry', () => {
  it('parses each data row into an entry', () => {
    const entries = parseRegistry(SAMPLE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      keyword: '护城河',
      slug: 'hu-cheng-he',
      category: '核心哲学',
      path: 'buffett/articles/keywords/hu-cheng-he.md',
      aliases: ['Economic Moat', '经济护城河'],
      status: '已核验',
    });
  });

  it('skips header and separator rows', () => {
    const entries = parseRegistry(SAMPLE);
    expect(entries.every((e) => e.keyword !== '关键词')).toBe(true);
  });
});

describe('buildLookup', () => {
  it('maps keyword and every alias to the entry', () => {
    const lookup = buildLookup(parseRegistry(SAMPLE));
    expect(lookup.get('护城河')?.slug).toBe('hu-cheng-he');
    expect(lookup.get('Economic Moat')?.slug).toBe('hu-cheng-he');
    expect(lookup.get('经济护城河')?.slug).toBe('hu-cheng-he');
    expect(lookup.get('盖可保险')?.slug).toBe('geico');
  });

  it('returns undefined for unknown terms', () => {
    const lookup = buildLookup(parseRegistry(SAMPLE));
    expect(lookup.get('不存在的词')).toBeUndefined();
  });
});
