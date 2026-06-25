// 每页一张 1200×630 的品牌 OG 图(astro-og-canvas / canvaskit,构建期生成)。
// key = 页面路径去首尾斜杠(根为 index),与 lib/seo.ogKey 一致,故各页 <head> 里的
// og:image(/og/<key>.png)正好命中这里生成的图。
import { OGImageRoute } from 'astro-og-canvas';
import { getArticles, getCategories } from '../../lib/articles';
import { getSources } from '../../lib/sources';
import { SITE, ogKey } from '../../lib/seo';

const [articles, sources, categories] = await Promise.all([
  getArticles(),
  getSources(),
  getCategories(),
]);

interface OgPage {
  title: string;
  subtitle: string;
}
const pages: Record<string, OgPage> = {};
const brand = '巴菲特知识库 · 慢慢读，反复看';

pages['index'] = { title: SITE.name, subtitle: '巴菲特致股东信、访谈与主题解读' };
pages['graph'] = { title: '知识图谱', subtitle: brand };
pages['search'] = { title: '搜索', subtitle: brand };
for (const c of categories) {
  pages[ogKey(`/categories/${c.slug}`)] = { title: c.name, subtitle: `解读 · ${brand}` };
}
for (const s of sources) {
  pages[ogKey(s.url)] = { title: s.title, subtitle: `${s.category} · 巴菲特知识库` };
}
for (const a of articles) {
  pages[ogKey(a.url)] = { title: a.title, subtitle: `${a.category} · 巴菲特知识库` };
}

// 单一字体子集(覆盖全站标题字形,由 npm run build:og-font 合并生成)。
// 路径相对项目根(构建期 cwd = site/)。
const fonts = ['./src/assets/og-noto-serif-sc-subset.ttf'];

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'route',
  pages,
  getImageOptions: (_path, page: OgPage) => ({
    title: page.title,
    description: page.subtitle,
    // 站点配色:米白底、左侧绿色竖条、深绿标题、灰描述。
    bgGradient: [[247, 244, 237]],
    border: { color: [72, 107, 85], width: 24, side: 'inline-start' },
    padding: 80,
    font: {
      title: {
        color: [37, 48, 43],
        size: 60,
        lineHeight: 1.3,
        weight: 'Bold',
        families: ['Noto Serif SC'],
      },
      description: {
        color: [111, 117, 110],
        size: 30,
        lineHeight: 1.4,
        families: ['Noto Serif SC'],
      },
    },
    fonts,
  }),
});
