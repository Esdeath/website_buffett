// SEO 纯逻辑:URL 归一、OG 图 key、绝对 URL,以及各类 JSON-LD 结构体的构造。
// 这里只产出数据,Astro.site / Astro.url 等运行时值由调用方(Seo.astro / 页面)注入,
// 便于单测且不耦合渲染。

/** 站点身份常量,取自既有代码(首页作者卡 / BaseLayout 标题)。 */
export const SITE = {
  name: '巴菲特知识库',
  tagline: '慢慢读，反复看，用原文校准判断。',
  description:
    '巴菲特知识库:284 篇巴菲特原文(致股东信、致合伙人信、访谈与股东大会)与主题解读,先原文后观点,用原文校准判断。',
  author: '滚雪球的Star',
  authorUrl: 'https://xueqiu.com/u/lovelive',
  lang: 'zh-CN',
  ogLocale: 'zh_CN',
} as const;

/** 路径归一:去掉尾部斜杠(根路径保留 /)。canonical 用。 */
export function canonicalPath(pathname: string): string {
  const stripped = pathname.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
}

/** 路径 → OG 图 key:去首尾斜杠,根路径记为 index。与 OGImageRoute 的 pages key 对齐。 */
export function ogKey(pathname: string): string {
  const key = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return key === '' ? 'index' : key;
}

/** 用站点根拼绝对 URL,容忍 site 带不带尾斜杠。 */
export function absoluteUrl(site: string | URL, pathname: string): string {
  return new URL(pathname, site.toString()).href;
}

export interface JsonLd {
  '@context': 'https://schema.org';
  [key: string]: unknown;
}

/** 站点级 WebSite + 站内搜索动作(让搜索引擎可能给出 sitelinks 搜索框)。 */
export function websiteLd(siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    alternateName: '巴菲特总纲',
    url: siteUrl,
    description: SITE.description,
    inLanguage: SITE.lang,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl.replace(/\/$/, '')}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

const publisher = () => ({
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.authorUrl,
});

export interface ArticleLdInput {
  url: string;
  title: string;
  description: string;
  keywords?: string[];
  section?: string;
  image?: string;
}

/** 内容页(原文 / 解读 / 关键词)用 Article,带作者、发布者、语言、关键词。 */
export function articleLd(input: ArticleLdInput): JsonLd {
  const ld: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    inLanguage: SITE.lang,
    mainEntityOfPage: input.url,
    url: input.url,
    author: { '@type': 'Person', name: SITE.author, url: SITE.authorUrl },
    publisher: publisher(),
  };
  if (input.image) ld.image = input.image;
  if (input.section) ld.articleSection = input.section;
  if (input.keywords && input.keywords.length) ld.keywords = input.keywords.join(',');
  return ld;
}

/** 面包屑:数组顺序即层级,position 从 1 起。 */
export function breadcrumbLd(items: { name: string; url: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** 分类列表页用 CollectionPage。 */
export function collectionLd(input: { url: string; name: string; description: string }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: SITE.lang,
    isPartOf: { '@type': 'WebSite', name: SITE.name },
  };
}
