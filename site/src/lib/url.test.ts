import { describe, it, expect } from 'vitest';
import { pathToUrl, typeFromPath } from './url';

describe('typeFromPath', () => {
  it('derives type from the directory under articles/', () => {
    expect(typeFromPath('buffett/articles/keywords/hu-cheng-he.md')).toBe('keyword');
    expect(typeFromPath('buffett/articles/companies/geico.md')).toBe('company');
    expect(typeFromPath('buffett/articles/people/charlie-munger.md')).toBe('person');
    expect(typeFromPath('buffett/articles/category-overviews/he-xin-zhe-xue.md')).toBe('category-overview');
    expect(typeFromPath('buffett/articles/industries/yin-hang.md')).toBe('industry');
    expect(typeFromPath('buffett/articles/questions/wei-shen-me.md')).toBe('question');
    expect(typeFromPath('buffett/articles/timelines/1956-1969.md')).toBe('timeline');
  });
});

describe('pathToUrl', () => {
  it('routes keyword articles to /keywords/[slug]', () => {
    expect(pathToUrl('buffett/articles/keywords/hu-cheng-he.md')).toBe('/keywords/hu-cheng-he');
  });
  it('routes non-keyword articles to /articles/[type]/[slug]', () => {
    expect(pathToUrl('buffett/articles/companies/geico.md')).toBe('/articles/company/geico');
    expect(pathToUrl('buffett/articles/people/charlie-munger.md')).toBe('/articles/person/charlie-munger');
  });
});
