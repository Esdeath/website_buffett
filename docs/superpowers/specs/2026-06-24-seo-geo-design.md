# SEO + GEO 设计（巴菲特知识库）

日期：2026-06-24
站点：Astro 静态站 → Cloudflare Pages
正式域名：`https://buffett.ayaseeri.com`

## 目标

为站点补齐传统搜索引擎优化（SEO）与面向 AI 搜索引擎的优化（GEO，Generative
Engine Optimization）。当前 `<head>` 仅有 charset / viewport / favicon / title，
无 description、Open Graph、canonical、结构化数据；无 robots.txt / sitemap /
llms.txt。本设计把这些一次补齐。

## 决策（已与用户确认）

- 正式域名：`https://buffett.ayaseeri.com`（`astro.config` 单点配置）。
- AI 抓取策略：**全面欢迎** 主流 AI 爬虫 + 检索机器人，并生成 `llms.txt` /
  `llms-full.txt`。内容为公开科普，追求最大化被 AI 引用。
- Open Graph 图：**自动生成** 每页品牌图（1200×630，站点绿 + 标题）。CJK 文字需
  内嵌字体；用 Noto Serif SC（OFL，可再分发）按全站标题字符**子集化**后提交，
  避免引入数 MB 字体与构建期网络依赖。

## 站点身份（取自现有代码）

- 名称：巴菲特知识库
- 标语：慢慢读，反复看，用原文校准判断。
- 作者：滚雪球的Star（雪球 https://xueqiu.com/u/lovelive）
- 规模：约 284 篇原文 + 解读文章（keyword / category-overview / question /
  timeline / company / person / industry）。

## 架构

所有页面都经过 `BaseLayout`，因此在 `BaseLayout` 的 `<head>` 渲染一个独立的
`Seo.astro` 组件，由 `BaseLayout` 接收的 props 驱动。各页面/布局只需把
`description`、`image`、`ogType`、`jsonLd`、`keywords`、`noindex` 传给
`BaseLayout`，head 逻辑集中在一处、可单测。

### 单元划分

- `src/lib/excerpt.ts` —— `toExcerpt(md, maxLen=150)`：去除 frontmatter、
  `[[wikilink]]`、markdown 链接/强调/代码/标题/HTML，压缩空白后截断加省略号。
  无 description 的页面据此从正文生成摘要。**TDD**，配 `excerpt.test.ts`。
- `src/lib/seo.ts` —— 纯函数：`canonicalPath(pathname)`（去尾斜杠归一）、
  `ogKey(pathname)`（→ OG 图 key，`/` → `index`）、以及构造 JSON-LD 的
  `websiteLd / articleLd / breadcrumbLd / collectionLd`。配 `seo.test.ts`。
- `src/components/Seo.astro` —— 输入 props，输出 `<title>`、
  `<meta name=description>`、canonical、Open Graph（og:title/description/url/
  image/type/site_name、locale=zh_CN）、Twitter `summary_large_image`、
  `<meta name=author>`、可选 `robots noindex`、以及 `<script type=ld+json>`。
  用 `Astro.site` 拼绝对 URL。
- `src/components/Seo.test`（可选）：canonical/og 绝对化逻辑放在 `seo.ts` 里测，
  组件本身只做拼装。

### 数据流

```
page/layout ──props──▶ BaseLayout ──props──▶ Seo.astro ──▶ <head> 标签 + JSON-LD
                                   └─ Astro.site / Astro.url 提供绝对 URL & 路径
```

## 各页面 SEO 内容

| 页面 | description | JSON-LD | 备注 |
|---|---|---|---|
| 首页 `/` | 标语 + 原文/解读篇数 | `WebSite`(+`SearchAction`→`/search?q=`) + `Organization`/作者 | 站点级身份 |
| 分类 `/categories/[slug]` | 「{name}」分类下的 N 篇解读… | `CollectionPage` + `BreadcrumbList` | |
| 解读/关键词（经 `ArticleLayout`） | 正文摘要 | `Article` + `BreadcrumbList` | author、inLanguage zh-CN、keywords、about |
| 原文 `/sources/[group]/[slug]` | 正文摘要（或 frontmatter description） | `Article` + `BreadcrumbList` | |
| 搜索 `/search` | 站内搜索说明 | — | `noindex`（查询型页面） |
| 图谱 `/graph` | 知识图谱说明 | — | 可索引 |

面包屑层级：首页 → 分类/原文分组 → 当前页。

## 抓取与站点地图

- `astro.config.mjs`：`site = https://buffett.ayaseeri.com`；加
  `@astrojs/sitemap` 集成（自动收录全部静态路由，生成 `sitemap-index.xml`）。
- `public/robots.txt`：`Allow: /`；显式 `Allow` 主流 AI/检索爬虫
  （GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、Claude-Web、anthropic-ai、
  PerplexityBot、Perplexity-User、Google-Extended、Applebot-Extended、Bingbot、
  CCBot 等）；`Sitemap: https://buffett.ayaseeri.com/sitemap-index.xml`。

## GEO / llms.txt

构建期端点，随内容自动同步（不会与正文漂移）：

- `src/pages/llms.txt.ts` → `/llms.txt`：llmstxt.org 格式。H1 标题 +
  一句话摘要 blockquote + 「原文」「解读」分节，列出枢纽页面（分类、原文分组、
  关键入口）链接。
- `src/pages/llms-full.txt.ts` → `/llms-full.txt`：全量纯文本语料。把全部原文 +
  解读按分类拼接（每篇含标题与绝对 URL），供 AI 一次抓取整库。

## OG 图片

- 依赖 `astro-og-canvas` 的 `OGImageRoute`：`src/pages/og/[...route].ts`。
- `pages` map 的 key = 页面 pathname 去首斜杠（`/` → `index`），生成
  `/og/<key>.png`；`Seo.astro` 用同一 `ogKey(pathname)` 推出本页图地址，二者对齐。
- 字体：`scripts/build-og-font.mjs` 用 `subset-font` 把 Noto Serif SC 子集化为
  「全站标题 + 品牌/UI 文案 + ASCII + 常用标点」的字符集，产物
  `src/assets/og-noto-serif-sc-subset.ttf`（提交入库，附 OFL 许可）。标题新增罕见
  字时重跑该脚本。
- 视觉：米白底 / 站点绿，标题居中，底部「巴菲特知识库」。
- 兜底：若字体获取受阻，退化为单张静态品牌 OG 图（本地系统字体渲染一次的 PNG），
  其余 SEO/GEO 不受影响。

## 不在本次范围（后续）

- Core Web Vitals / 性能调优。
- Cloudflare `_headers` 缓存/安全头。

## 实施顺序（按 ROI 与风险）

1. `astro.config` 域名 + sitemap 集成。
2. `excerpt.ts` + 测试（TDD）。
3. `seo.ts` + 测试；`Seo.astro`；`BaseLayout` 接 props。
4. 各页面/布局传 description 与 JSON-LD。
5. `robots.txt`。
6. `llms.txt` / `llms-full.txt` 端点。
7. OG 图字体子集 + `OGImageRoute` + `Seo` 引用（最后做，可独立回退）。
8. `npm run build` 验证全站构建通过。

## 测试

- 单元：`excerpt.test.ts`、`seo.test.ts`（canonical 归一、ogKey、JSON-LD 形状）。
- 集成：`astro build` 通过；抽查 `dist/` 内 `robots.txt`、`sitemap-index.xml`、
  `llms.txt`、若干页面 `<head>` 含 canonical/OG/JSON-LD、`/og/*.png` 生成。
