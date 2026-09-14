import { describe, it, expect } from 'vitest';
import {
  canonicalPath,
  ogKey,
  absoluteUrl,
  websiteLd,
  articleLd,
  breadcrumbLd,
  collectionLd,
  bookLd,
  chapterLd,
  chapterMetaDescription,
  ogTitleFontSize,
  SITE,
} from './seo';

describe('canonicalPath', () => {
  it('keeps root as /', () => {
    expect(canonicalPath('/')).toBe('/');
  });
  it('strips a single trailing slash', () => {
    expect(canonicalPath('/sources/letters/1977/')).toBe('/sources/letters/1977');
  });
  it('leaves a path without trailing slash unchanged', () => {
    expect(canonicalPath('/graph')).toBe('/graph');
  });
  it('collapses repeated trailing slashes', () => {
    expect(canonicalPath('/a/b///')).toBe('/a/b');
  });
});

describe('ogKey', () => {
  it('maps root to index', () => {
    expect(ogKey('/')).toBe('index');
  });
  it('strips leading and trailing slashes', () => {
    expect(ogKey('/sources/letters/1977/')).toBe('sources/letters/1977');
    expect(ogKey('/graph')).toBe('graph');
  });
});

describe('OG and chapter copy formatting', () => {
  it('reduces the font size only for extra-long OG titles', () => {
    expect(ogTitleFontSize('巴菲特不在之后，什么还能留下？')).toBe(60);
    expect(ogTitleFontSize('当所有人都在赚钱，价格还重要吗？')).toBe(54);
  });

  it('removes a trailing question mark before the chapter-description colon', () => {
    expect(chapterMetaDescription('什么会让你永远出局？', '风险与现金', '导读'))
      .toBe('什么会让你永远出局：风险与现金。导读');
  });
});

describe('absoluteUrl', () => {
  it('joins site and path regardless of trailing slash on site', () => {
    expect(absoluteUrl('https://x.com', '/a')).toBe('https://x.com/a');
    expect(absoluteUrl('https://x.com/', '/a')).toBe('https://x.com/a');
  });
  it('accepts a URL object for site', () => {
    expect(absoluteUrl(new URL('https://x.com'), '/a/b')).toBe('https://x.com/a/b');
  });
});

describe('websiteLd', () => {
  const ld = websiteLd('https://x.com');
  it('declares a WebSite with the site name and url', () => {
    expect(ld['@type']).toBe('WebSite');
    expect(ld.name).toBe(SITE.name);
    expect(ld.url).toBe('https://x.com');
    expect(ld.inLanguage).toBe('zh-CN');
  });
  it('declares a SearchAction targeting /search?q=', () => {
    expect(ld.potentialAction['@type']).toBe('SearchAction');
    expect(ld.potentialAction.target.urlTemplate).toBe(
      'https://x.com/search?q={search_term_string}',
    );
    expect(ld.potentialAction['query-input']).toContain('search_term_string');
  });
});

describe('articleLd', () => {
  const ld = articleLd({
    url: 'https://x.com/a',
    title: '标题',
    description: '摘要',
    keywords: ['复利', '护城河'],
    section: '投资理念',
    image: 'https://x.com/og/a.png',
  });
  it('is an Article with headline, language, author and publisher', () => {
    expect(ld['@type']).toBe('Article');
    expect(ld.headline).toBe('标题');
    expect(ld.inLanguage).toBe('zh-CN');
    expect(ld.author.name).toBe(SITE.author);
    expect(ld.publisher.name).toBe(SITE.name);
    expect(ld.mainEntityOfPage).toBe('https://x.com/a');
    expect(ld.image).toBe('https://x.com/og/a.png');
  });
  it('passes keywords through as a comma-joined string', () => {
    expect(ld.keywords).toBe('复利,护城河');
  });
  it('omits keywords when none given', () => {
    const bare = articleLd({ url: 'https://x.com/a', title: 't', description: 'd' });
    expect('keywords' in bare).toBe(false);
  });
});

describe('breadcrumbLd', () => {
  const ld = breadcrumbLd([
    { name: '首页', url: 'https://x.com/' },
    { name: '投资理念', url: 'https://x.com/categories/tou-zi-li-nian' },
    { name: '复利', url: 'https://x.com/keywords/fu-li' },
  ]);
  it('is a BreadcrumbList with 1-based positions', () => {
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[0].position).toBe(1);
    expect(ld.itemListElement[2].position).toBe(3);
    expect(ld.itemListElement[1].name).toBe('投资理念');
    expect(ld.itemListElement[1].item).toBe('https://x.com/categories/tou-zi-li-nian');
  });
});

describe('collectionLd', () => {
  const ld = collectionLd({ url: 'https://x.com/c', name: '投资理念', description: 'd' });
  it('is a CollectionPage with name, url and language', () => {
    expect(ld['@type']).toBe('CollectionPage');
    expect(ld.name).toBe('投资理念');
    expect(ld.url).toBe('https://x.com/c');
    expect(ld.inLanguage).toBe('zh-CN');
  });
});

describe('bookLd', () => {
  const ld = bookLd({
    url: 'https://x.com/books/qa',
    name: '巴菲特问答录',
    description: '300 问',
    image: 'https://x.com/cover.png',
    chapters: [
      { name: '能力圈', url: 'https://x.com/books/qa/1' },
      { name: '企业价值', url: 'https://x.com/books/qa/2' },
    ],
  });

  it('describes an edited Book without attributing authorship to Buffett', () => {
    expect(ld['@type']).toBe('Book');
    expect(ld.editor.name).toBe(SITE.author);
    expect(ld.about.name).toBe('沃伦·巴菲特');
    expect(ld).not.toHaveProperty('author');
    expect(ld.hasPart).toHaveLength(2);
    expect(ld.hasPart[1].position).toBe(2);
  });
});

describe('chapterLd', () => {
  const ld = chapterLd({
    url: 'https://x.com/books/qa/one',
    name: '一家公司，怎样才算真正看懂？',
    description: '能力圈',
    position: 1,
    bookUrl: 'https://x.com/books/qa',
    bookName: '巴菲特问答录',
  });

  it('links a Chapter back to its Book', () => {
    expect(ld['@type']).toBe('Chapter');
    expect(ld.position).toBe(1);
    expect(ld.isPartOf).toEqual({
      '@type': 'Book',
      name: '巴菲特问答录',
      url: 'https://x.com/books/qa',
    });
  });
});
