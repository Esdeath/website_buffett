import { describe, it, expect } from 'vitest';
import { assembleArticle } from './articles';
import type { KeywordEntry } from './registry';

const entries: KeywordEntry[] = [
  { keyword: '护城河', slug: 'hu-cheng-he', category: '核心哲学', path: 'buffett/articles/keywords/hu-cheng-he.md', aliases: [], status: '已核验' },
];

describe('assembleArticle', () => {
  it('uses registry category and computes canonical url for a keyword article', () => {
    const a = assembleArticle(
      { filePath: '../buffett/articles/keywords/hu-cheng-he.md', data: { title: '护城河', type: 'keyword', slug: 'hu-cheng-he' }, body: '正文[[安全边际]]' },
      entries,
    );
    expect(a.slug).toBe('hu-cheng-he');
    expect(a.type).toBe('keyword');
    expect(a.category).toBe('核心哲学');
    expect(a.url).toBe('/keywords/hu-cheng-he');
  });

  it('falls back to type-based category bucket for non-registry articles', () => {
    const a = assembleArticle(
      { filePath: '../buffett/articles/questions/wei-shen-me.md', data: { title: '为什么', type: 'question', slug: 'wei-shen-me' }, body: '' },
      entries,
    );
    // question 不在 registry,category 用类型兜底标签
    expect(a.category).toBe('问题');
    expect(a.url).toBe('/articles/question/wei-shen-me');
  });

  it('buckets a non-registry company into 公司 (not the raw english type)', () => {
    // dexter-shoe 是唯一不在 registry 的 company,必须落到「公司」而非 "company"
    const a = assembleArticle(
      { filePath: '../buffett/articles/companies/dexter-shoe.md', data: { title: 'Dexter Shoe', type: 'company', slug: 'dexter-shoe' }, body: '' },
      entries,
    );
    expect(a.category).toBe('公司');
    expect(a.url).toBe('/articles/company/dexter-shoe');
  });
});
