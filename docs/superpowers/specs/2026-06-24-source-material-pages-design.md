# 把 284 篇原文纳入网站展示

## 背景

`buffett/` 目录下有 466 篇 `.md`,但网站只收录了 `buffett/articles/` 的 **182 篇解读文章**。另有 **284 篇原始素材**(巴菲特原文)从未上站:

| 目录 | frontmatter category | 篇数 |
|---|---|---|
| `buffett/interview/` | 访谈与文章 | 151 |
| `buffett/berkshire/gu-dong-xin/` | 致股东信 | 65 |
| `buffett/berkshire/he-huo-ren-xin/` | 致合伙人信 | 35 |
| `buffett/shareholders/` | 股东大会 | 33 |
| **合计** | | **284** |

目标:把这 284 篇做成网站页面,按分类加进侧边栏,与现有 182 篇解读共存。

## 已确认的设计决策

1. **侧边栏分两大区**:「解读」(现有 14 类) 和「原文」(4 类:访谈与文章 / 致股东信 / 致合伙人信 / 股东大会),视觉区隔,都是二级展开菜单。
2. **原文排序**:按 frontmatter 的 `order` 字段(全部 284 篇都有该字段)。
3. **二级标签**:用完整标题(原文标题无冒号副标题结构)。
4. **原文详情页**:纯阅读页(标题 + 正文)。正文走 Markdown 渲染,自动吃到现有 `remarkWikilink` 插件 —— 正文里出现注册表关键词时自动变成链接,跳到该关键词的解读文章。
5. **关键事实(已核对)**:284 个原文 slug 彼此唯一,且与 182 个解读 slug **零冲突**;全部有 `order`。

## 分类与 URL

按 frontmatter `category` 分 4 组,URL 用 `/sources/` 前缀隔离命名空间:

| category | URL 前缀 | 篇数 |
|---|---|---|
| 访谈与文章 | `/sources/interviews/<slug>` | 151 |
| 致股东信 | `/sources/letters/<slug>` | 65 |
| 致合伙人信 | `/sources/partner-letters/<slug>` | 35 |
| 股东大会 | `/sources/meetings/<slug>` | 33 |

分组键(category 中文名 → ASCII group slug)集中在一处定义,作为唯一真相来源(类比现有 `CATEGORY_SLUG`)。

## 改动清单

1. **`src/content.config.ts`** — 新增 `sources` collection:
   - `loader: glob({ pattern: '**/*.md', base: '../buffett', ... })` 限定到三个原文目录(用多个 base 或 pattern 排除 `articles`)。
   - schema:`title`(必填)、`slug`(必填)、`category`(必填)、`order`(number)、`description`(可选)。无 `type`。

2. **`src/lib/sources.ts`(新)** — 与 `articles.ts` 平行:
   - 加载 sources collection,按 `category` 分组,组内按 `order` 升序。
   - 产出 `getSourceGroups(): { name, groupSlug, articles: {slug,title,url,order}[] }[]`。
   - URL = `/sources/<groupSlug>/<slug>`,`groupSlug` 来自分组映射。
   - 当前路径匹配(active 高亮)用规范化路径,与侧边栏现有逻辑一致。

3. **`src/pages/sources/[group]/[slug].astro`(新)** — 原文阅读页:
   - `getStaticPaths` 遍历 284 篇,params = `{group, slug}`。
   - 复用 `BaseLayout`,渲染 `<h1>{title}</h1>` + 分类标签 + `<Content />`。
   - 不挂右栏面板(纯阅读)。`<Content />` 自动经 `remarkWikilink`。

4. **`src/components/Sidebar.astro`** — 在现有 `.cat-menu` 下方加:
   - 一个「原文」分区小标题。
   - 一份原文的二级展开菜单(4 个 `<details>`),复用现有 summary/sub 样式、active 高亮、sessionStorage 展开记忆、客户端路径校准逻辑(把选择器从 `.cat-menu` 扩到同时覆盖原文菜单,或复用同一 class)。
   - 数据来自 `getSourceGroups()`。

5. **`scripts/validate-content.mjs`** — 扩展校验原文:
   - 新增遍历三个原文目录:校验 `title` 存在、`slug` 与文件名一致、`category` 在 4 个合法值内、`order` 为数字。
   - slug 唯一性:原文之间查重(命名空间 `source/<slug>`),不与解读混。
   - 原文**不要求** `type`、不要求 registry 注册、不要求来源矩阵/原话卡片。
   - wiki-link 死链校验对原文同样生效(原文正文里的 `[[...]]` 若有也要可解析)。

6. **`src/pages/index.astro`(可选小改)** — 首页「284 篇原文」现在真的有页面了,可加一个入口或更新措辞。实现时如改动会单独说明。

## 不改的东西

- 182 篇解读文章的加载、URL、侧边栏「解读」区、右栏面板、registry、来源矩阵 —— 全部不动。
- `astro.config.mjs` 的 `remarkWikilink` 是全局 markdown 插件,自动覆盖新页面,无需改(实现时验证一次)。

## 验证

- `npm run build` 通过(含校验脚本),页面总数从 199 增加约 284。
- 产物核对:
  - `/sources/<group>/<slug>` 页面全部生成(284 个),无死链。
  - 侧边栏「原文」区 4 个分类、计数为 151/65/35/33。
  - 任取一篇原文页:标题 + 正文正常;正文里若出现注册表关键词(如「安全边际」)渲染成链接并可跳转。
  - 当前原文页在侧边栏高亮、其分类自动展开。
- slug 冲突保护:校验脚本对原文 slug 查重通过。
