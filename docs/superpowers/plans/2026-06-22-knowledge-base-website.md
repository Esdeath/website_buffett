# 巴菲特知识库网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已就绪的 182 篇 Markdown 知识库（`buffett/articles/`）构建成一个 Astro 静态站，支持 `[[关键词]]` 点击跳转、反向链接、全站知识图谱、客户端全文搜索，部署到 Cloudflare Pages。

**Architecture:** 新建 `site/` 子目录放 Astro 应用，通过相对路径读取仓库根的 `buffett/` 内容与 `docs/keyword-registry.md`。构建期解析注册表为「关键词/别名 → canonical URL」映射；一个 remark 插件在 Markdown→HTML 阶段把 `[[关键词]]` 转成站内链接（解析不到即报错）；扫描全文构建反向链接索引与图谱数据；图谱与搜索作为 Astro island 仅在需要的页面加载。

**Tech Stack:** Astro 5（content collections glob loader）、remark（自定义插件）、Cytoscape.js + cytoscape-cose-bilkent（图谱）、Pagefind（搜索）、Cloudflare Pages（部署）。Node 22 / npm 10。

**关键数据事实（已核验，写代码时依赖）：**
- 文章正文里的 `category`/`type` frontmatter **不可信**（全部 182 篇 `category` 都误填为 `"行业"`）。**分类的唯一真相来源是 `docs/keyword-registry.md` 的「分类」列**，文章归属用 frontmatter 的 `type` + registry 推导，不用 frontmatter 的 `category`。
- 11 个分类（来自 registry，含数量）：核心哲学(16)、投资理念(16)、企业经营(16)、财务指标(18)、品格与心性(17)、公司(13)、行业(5)、人物(13)、保险、浮存金与风险(12)、市场周期与风险控制(13)、宏观经济与投资环境(13)。
- registry 152 行，全部指向真实存在的文件；正文 unique wiki-link target 恰好 152 个，全部能在 registry 找到。数据完全自洽。
- `type` 分布：category-overview 12 / company 14 / industry 5 / keyword 121 / person 13 / question 10 / timeline 7 = 182。
- registry 行格式：`| 关键词 | slug | 分类 | 词条路径 | 别名 | 状态 |`，别名是逗号分隔，词条路径形如 `buffett/articles/keywords/hu-cheng-he.md`。
- wiki-link 两种形态：`[[护城河]]` 与 `[[避免永久性损失|永久性损失]]`（管道符左=canonical 关键词，右=显示文本）。
- 路由：`type: keyword`（121 篇）→ `/keywords/[slug]`；其余六类 → `/articles/[type]/[slug]`。同一文章只有一个 canonical URL。

---

## 文件结构

```text
site/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── .gitignore
├── src/
│   ├── content.config.ts            # content collection: glob ../buffett/articles
│   ├── lib/
│   │   ├── registry.ts              # 解析 keyword-registry.md → KeywordEntry[] + 查找 Map
│   │   ├── registry.test.ts
│   │   ├── url.ts                   # 词条路径 → 站内 URL 的纯函数
│   │   ├── url.test.ts
│   │   ├── remark-wikilink.mjs      # [[关键词]] → <a> remark 插件
│   │   ├── remark-wikilink.test.mjs
│   │   ├── backlinks.ts             # 扫全文构建 keyword→[文章] 反向索引
│   │   ├── backlinks.test.ts
│   │   ├── graph.ts                 # 构建 {nodes, edges}
│   │   └── graph.test.ts
│   ├── styles/tokens.css            # §10.3 设计 token
│   ├── layouts/
│   │   ├── BaseLayout.astro         # 三栏框架 + 头部 + 视图切换
│   │   └── ArticleLayout.astro      # 文章/词条共用正文骨架
│   ├── components/
│   │   ├── Sidebar.astro            # 左栏:分类 + 搜索入口
│   │   ├── KeywordPanel.astro       # 右栏:当前文章关键词上下文
│   │   ├── Backlinks.astro          # 反向链接列表
│   │   ├── SourceMatrix.astro       # 「来源」视图
│   │   ├── GraphView.astro          # 图谱 island 容器
│   │   └── graph-client.ts          # Cytoscape 初始化(浏览器端)
│   └── pages/
│       ├── index.astro              # 首页
│       ├── categories/[category].astro
│       ├── keywords/[slug].astro
│       ├── articles/[type]/[slug].astro
│       ├── graph.astro
│       └── search.astro
└── scripts/
    └── validate-content.mjs         # §11.3 校验脚本
```

测试用 Vitest（Astro 官方推荐、对 `.ts`/`.mjs` 都友好）。纯逻辑（registry/url/backlinks/graph/remark）全部 TDD；`.astro` 页面与图谱/搜索交互用构建产物 + 校验脚本 + 人工验收覆盖。

---

## Task 1: 脚手架 Astro 项目

**Files:**
- Create: `site/package.json`
- Create: `site/astro.config.mjs`
- Create: `site/tsconfig.json`
- Create: `site/.gitignore`
- Create: `site/src/pages/index.astro`（占位，后续替换）

- [ ] **Step 1: 创建 `site/package.json`**

```json
{
  "name": "buffett-kb-site",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "node scripts/validate-content.mjs && astro build && pagefind --site dist",
    "preview": "astro preview",
    "test": "vitest run",
    "validate": "node scripts/validate-content.mjs"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "cytoscape": "^3.30.0",
    "cytoscape-cose-bilkent": "^4.1.0"
  },
  "devDependencies": {
    "pagefind": "^1.1.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 `site/astro.config.mjs`**

> wiki-link 插件在 Task 4 加进来，这里先留好 markdown.remarkPlugins 空数组与注释。`srcDir`/`outDir` 用默认。

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://buffett-kb.pages.dev', // 部署后改为实际域名
  markdown: {
    // remarkWikilink 在 Task 4 接入
    remarkPlugins: [],
  },
});
```

- [ ] **Step 3: 创建 `site/tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: 创建 `site/.gitignore`**

```text
dist/
node_modules/
.astro/
```

- [ ] **Step 5: 创建占位首页 `site/src/pages/index.astro`**

```astro
---
---
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>巴菲特知识库</title></head>
  <body><h1>巴菲特知识库</h1><p>建设中。</p></body>
</html>
```

- [ ] **Step 6: 安装依赖并验证脚手架可构建**

> 此时 `validate-content.mjs`（Task 13）尚不存在，所以用 `npx astro build` 直接验证脚手架，**不要**跑 `npm run build`（那条含校验脚本，要等 Task 13）。

Run（在 `site/` 目录）: `cd site && npm install`
Expected: 安装成功。
Run: `cd site && npx astro build`
Expected: 成功，生成 `site/dist/index.html`。

- [ ] **Step 7: Commit**

```bash
git add site/package.json site/astro.config.mjs site/tsconfig.json site/.gitignore site/src/pages/index.astro
git commit -m "feat(site): scaffold Astro project"
```

---

## Task 2: 解析关键词注册表（registry.ts）

**Files:**
- Create: `site/src/lib/registry.ts`
- Test: `site/src/lib/registry.test.ts`

注册表是全站 wiki-link 的唯一解析源。本任务实现纯函数解析。

- [ ] **Step 1: 写失败测试 `site/src/lib/registry.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd site && npx vitest run src/lib/registry.test.ts`
Expected: FAIL（`parseRegistry` is not defined / 模块不存在）。

- [ ] **Step 3: 实现 `site/src/lib/registry.ts`**

```ts
export interface KeywordEntry {
  keyword: string;
  slug: string;
  category: string;
  path: string;       // 仓库根相对路径,如 buffett/articles/keywords/hu-cheng-he.md
  aliases: string[];
  status: string;
}

/** 解析 docs/keyword-registry.md 的 Markdown 表格为条目数组。 */
export function parseRegistry(markdown: string): KeywordEntry[] {
  const entries: KeywordEntry[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const [keyword, slug, category, path, aliasCell, status] = cells;
    if (keyword === '关键词' || /^-+$/.test(keyword)) continue; // 表头/分隔行
    const aliases = aliasCell
      .split(/[,，]/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    entries.push({ keyword, slug, category, path, aliases, status });
  }
  return entries;
}

/** 构建「关键词或别名 → 条目」查找表。 */
export function buildLookup(entries: KeywordEntry[]): Map<string, KeywordEntry> {
  const map = new Map<string, KeywordEntry>();
  for (const e of entries) {
    map.set(e.keyword, e);
    for (const alias of e.aliases) map.set(alias, e);
  }
  return map;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd site && npx vitest run src/lib/registry.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 用真实 registry 冒烟验证**

Run: `cd site && node --input-type=module -e "import {parseRegistry,buildLookup} from './src/lib/registry.ts'; import {readFileSync} from 'node:fs'; const e=parseRegistry(readFileSync('../docs/keyword-registry.md','utf8')); console.log('entries',e.length); const l=buildLookup(e); console.log('护城河→',l.get('护城河')?.slug);"` 
Expected: `entries 152` 与 `护城河→ hu-cheng-he`。（若 node 不能直跑 .ts，跳过此步，Task 5 backlinks 会间接覆盖。）

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/registry.ts site/src/lib/registry.test.ts
git commit -m "feat(site): parse keyword registry into lookup map"
```

---

## Task 3: 词条路径 → 站内 URL（url.ts）

**Files:**
- Create: `site/src/lib/url.ts`
- Test: `site/src/lib/url.test.ts`

把 registry 的「词条路径」映射成 canonical 站内 URL。`keyword` 类 → `/keywords/[slug]`；其余 → `/articles/[type]/[slug]`。

- [ ] **Step 1: 写失败测试 `site/src/lib/url.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd site && npx vitest run src/lib/url.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `site/src/lib/url.ts`**

```ts
/** 目录名(复数) → type(单数),与 frontmatter type 对齐。 */
const DIR_TO_TYPE: Record<string, string> = {
  'keywords': 'keyword',
  'companies': 'company',
  'industries': 'industry',
  'people': 'person',
  'questions': 'question',
  'timelines': 'timeline',
  'category-overviews': 'category-overview',
};

/** 从词条路径取目录,映射为 type。 */
export function typeFromPath(path: string): string {
  const m = path.match(/articles\/([^/]+)\//);
  if (!m) throw new Error(`无法从路径推断类型: ${path}`);
  const type = DIR_TO_TYPE[m[1]];
  if (!type) throw new Error(`未知文章目录: ${m[1]}`);
  return type;
}

/** 取文件名(不含 .md)作为 slug。 */
export function slugFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

/** 词条路径 → canonical 站内 URL。 */
export function pathToUrl(path: string): string {
  const type = typeFromPath(path);
  const slug = slugFromPath(path);
  return type === 'keyword' ? `/keywords/${slug}` : `/articles/${type}/${slug}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd site && npx vitest run src/lib/url.test.ts`
Expected: PASS（9 个断言）。

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/url.ts site/src/lib/url.test.ts
git commit -m "feat(site): map registry paths to canonical site URLs"
```

---

## Task 4: wiki-link remark 插件

**Files:**
- Create: `site/src/lib/remark-wikilink.mjs`
- Test: `site/src/lib/remark-wikilink.test.mjs`
- Modify: `site/astro.config.mjs`

把正文 `[[关键词]]` / `[[关键词|显示文本]]` 转成站内链接。解析不到 → 抛错（构建中断），满足「死链零容忍」。插件用 `.mjs`，在构建期读取 registry 并注入查找表。

- [ ] **Step 1: 写失败测试 `site/src/lib/remark-wikilink.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { remarkWikilink } from './remark-wikilink.mjs';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

// 最小查找表:关键词/别名 → { url, keyword }
const lookup = new Map([
  ['护城河', { url: '/keywords/hu-cheng-he', keyword: '护城河' }],
  ['避免永久性损失', { url: '/keywords/bi-mian-yong-jiu-xing-sun-shi', keyword: '避免永久性损失' }],
]);

async function render(md) {
  const file = await remark()
    .use(remarkWikilink, { lookup })
    .use(remarkHtml, { sanitize: false })
    .process(md);
  return String(file);
}

describe('remarkWikilink', () => {
  it('converts [[关键词]] to a link with the keyword as text', async () => {
    const html = await render('巴菲特看重[[护城河]]。');
    expect(html).toContain('<a href="/keywords/hu-cheng-he"');
    expect(html).toContain('>护城河</a>');
  });

  it('uses the right-hand display text for piped links', async () => {
    const html = await render('要[[避免永久性损失|不亏本]]。');
    expect(html).toContain('href="/keywords/bi-mian-yong-jiu-xing-sun-shi"');
    expect(html).toContain('>不亏本</a>');
  });

  it('throws on an unknown keyword', async () => {
    await expect(render('引用[[不存在的词]]。')).rejects.toThrow(/不存在的词/);
  });
});
```

> 该测试需要 `remark`、`remark-html`。它们是 Astro 的传递依赖,但为测试稳定显式装：`cd site && npm i -D remark remark-html`。

- [ ] **Step 2: 安装测试依赖并运行确认失败**

Run: `cd site && npm i -D remark remark-html && npx vitest run src/lib/remark-wikilink.test.mjs`
Expected: FAIL（`remarkWikilink` 未定义）。

- [ ] **Step 3: 实现 `site/src/lib/remark-wikilink.mjs`**

```js
import { visit } from 'unist-util-visit';

const WIKILINK = /\[\[([^\]]+)\]\]/g;

/**
 * remark 插件:把 text 节点里的 [[关键词]] / [[关键词|显示]] 替换为链接节点。
 * options.lookup: Map<string, { url, keyword }>
 * 解析不到的关键词直接抛错,中断构建。
 */
export function remarkWikilink(options = {}) {
  const lookup = options.lookup;
  if (!lookup) throw new Error('remarkWikilink: 缺少 lookup');

  return (tree, file) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === null) return;
      const value = node.value;
      if (!value.includes('[[')) return;

      const children = [];
      let lastIndex = 0;
      let match;
      WIKILINK.lastIndex = 0;
      while ((match = WIKILINK.exec(value)) !== null) {
        const [full, inner] = match;
        const [rawKeyword, rawDisplay] = inner.split('|');
        const keyword = rawKeyword.trim();
        const display = (rawDisplay ?? rawKeyword).trim();
        const entry = lookup.get(keyword);
        if (!entry) {
          throw new Error(
            `死链: 关键词 [[${keyword}]] 不在注册表中` +
              (file?.path ? ` (文件 ${file.path})` : ''),
          );
        }
        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) });
        }
        children.push({
          type: 'link',
          url: entry.url,
          data: { hProperties: { className: 'wikilink', 'data-keyword': entry.keyword } },
          children: [{ type: 'text', value: display }],
        });
        lastIndex = match.index + full.length;
      }
      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) });
      }
      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}
```

> 依赖 `unist-util-visit`（Astro 传递依赖）。若测试报找不到，`cd site && npm i -D unist-util-visit`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd site && npx vitest run src/lib/remark-wikilink.test.mjs`
Expected: PASS（3 个用例，含抛错用例）。

- [ ] **Step 5: 接入 `site/astro.config.mjs`**

> 构建期读取真实 registry，组装 `{url, keyword}` 查找表传给插件。这里复用 Task 2/3 的纯函数。

```js
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRegistry, buildLookup } from './src/lib/registry.ts';
import { pathToUrl } from './src/lib/url.ts';
import { remarkWikilink } from './src/lib/remark-wikilink.mjs';

const registryPath = fileURLToPath(new URL('../docs/keyword-registry.md', import.meta.url));
const entries = parseRegistry(readFileSync(registryPath, 'utf8'));
const entryLookup = buildLookup(entries);

// 转成插件需要的 {url, keyword} 形态
const lookup = new Map();
for (const [term, e] of entryLookup) {
  lookup.set(term, { url: pathToUrl(e.path), keyword: e.keyword });
}

export default defineConfig({
  site: 'https://buffett-kb.pages.dev', // 部署后改为实际域名
  markdown: {
    remarkPlugins: [[remarkWikilink, { lookup }]],
  },
});
```

> 注：Astro 配置可加载 `.ts`（用 esbuild）。若环境报错无法在 config 中 import `.ts`，把 `registry.ts`/`url.ts` 改为同时提供 `.mjs` 版本或在 config 内内联同等逻辑。优先按上面写法，遇错再降级。

- [ ] **Step 6: 全量构建验证 wiki-link 全部解析（这是 §5.2 死链验收）**

Run: `cd site && npx astro build`
Expected: 构建成功，无「死链」报错。若报某关键词死链，说明 registry 与正文不一致——记录该词，停下来与用户确认（数据预期是 0 死链）。

- [ ] **Step 7: Commit**

```bash
git add site/src/lib/remark-wikilink.mjs site/src/lib/remark-wikilink.test.mjs site/astro.config.mjs site/package.json site/package-lock.json
git commit -m "feat(site): resolve [[wikilinks]] to site URLs via remark, fail on dead links"
```

---

## Task 5: 反向链接索引（backlinks.ts）

**Files:**
- Create: `site/src/lib/backlinks.ts`
- Test: `site/src/lib/backlinks.test.ts`

扫描每篇文章正文里的 `[[关键词]]`，建 `关键词 slug → [引用它的文章]` 反向表，供词条页「哪些文章引用了我」。

- [ ] **Step 1: 写失败测试 `site/src/lib/backlinks.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd site && npx vitest run src/lib/backlinks.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `site/src/lib/backlinks.ts`**

```ts
const WIKILINK = /\[\[([^\]]+)\]\]/g;

export interface ArticleRef {
  slug: string;
  title: string;
  url: string;
}

interface ArticleInput extends ArticleRef {
  body: string;
}

/** 取正文里所有 [[关键词]] 的 canonical 关键词(管道符左侧),去重。 */
export function extractWikilinkTargets(body: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  WIKILINK.lastIndex = 0;
  while ((m = WIKILINK.exec(body)) !== null) {
    set.add(m[1].split('|')[0].trim());
  }
  return [...set];
}

/** 关键词 slug → 引用它的文章列表(保持输入顺序)。 */
export function buildBacklinks(
  articles: ArticleInput[],
  keywordToSlug: Map<string, string>,
): Map<string, ArticleRef[]> {
  const out = new Map<string, ArticleRef[]>();
  for (const a of articles) {
    for (const keyword of extractWikilinkTargets(a.body)) {
      const slug = keywordToSlug.get(keyword);
      if (!slug) continue; // 未注册关键词在构建期已被 remark 拦截,这里防御性跳过
      if (!out.has(slug)) out.set(slug, []);
      const list = out.get(slug)!;
      if (!list.some((r) => r.slug === a.slug)) {
        list.push({ slug: a.slug, title: a.title, url: a.url });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd site && npx vitest run src/lib/backlinks.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/backlinks.ts site/src/lib/backlinks.test.ts
git commit -m "feat(site): build keyword backlink index from article bodies"
```

---

## Task 6: 图谱数据构建（graph.ts）

**Files:**
- Create: `site/src/lib/graph.ts`
- Test: `site/src/lib/graph.test.ts`

构建 `{nodes, edges}`：节点=文章（按分类着色、按入度定大小），边=正文 `[[关键词]]` 指向的 canonical 文章（有向、去重）。

- [ ] **Step 1: 写失败测试 `site/src/lib/graph.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd site && npx vitest run src/lib/graph.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `site/src/lib/graph.ts`**

```ts
import { extractWikilinkTargets } from './backlinks';

export interface GraphNode {
  id: string;        // slug
  label: string;     // 标题
  category: string;
  url: string;
  indegree: number;
}
export interface GraphEdge {
  source: string;
  target: string;
}
interface ArticleInput {
  slug: string;
  title: string;
  url: string;
  category: string;
  body: string;
}

export function buildGraph(
  articles: ArticleInput[],
  keywordToSlug: Map<string, string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const known = new Set(articles.map((a) => a.slug));
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const indegree = new Map<string, number>();

  for (const a of articles) {
    for (const keyword of extractWikilinkTargets(a.body)) {
      const target = keywordToSlug.get(keyword);
      if (!target || !known.has(target) || target === a.slug) continue;
      const key = `${a.slug}->${target}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ source: a.slug, target });
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }

  const nodes: GraphNode[] = articles.map((a) => ({
    id: a.slug,
    label: a.title,
    category: a.category,
    url: a.url,
    indegree: indegree.get(a.slug) ?? 0,
  }));

  return { nodes, edges };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd site && npx vitest run src/lib/graph.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/graph.ts site/src/lib/graph.test.ts
git commit -m "feat(site): build knowledge graph nodes and edges"
```

---

## Task 7: content collection + 文章数据装配层

**Files:**
- Create: `site/src/content.config.ts`
- Create: `site/src/lib/articles.ts`（装配：collection + registry → 统一文章模型 + 各索引）
- Test: `site/src/lib/articles.test.ts`（仅测纯装配函数 `assembleArticle`）

把 Astro content collection 与 registry 数据拼成页面层要用的统一模型，并集中暴露 `getCategories()`、`getBacklinks()`、`getGraph()`。

- [ ] **Step 1: 创建 `site/src/content.config.ts`**

> glob loader 指向仓库根的 `buffett/articles`。frontmatter 的 `category` 不可信，schema 里把它设为可选、不参与分类。

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: '../buffett/articles' }),
  schema: z.object({
    title: z.string(),
    type: z.string(),
    slug: z.string(),
    category: z.string().optional(), // 不可信,仅占位
    keywords: z.array(z.string()).optional().default([]),
    related: z.array(z.string()).optional().default([]),
    sourceTypes: z.array(z.string()).optional().default([]),
    status: z.string().optional(),
  }),
});

export const collections = { articles };
```

- [ ] **Step 2: 写失败测试 `site/src/lib/articles.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { assembleArticle } from './articles';
import type { KeywordEntry } from './registry';

const entries: KeywordEntry[] = [
  { keyword: '护城河', slug: 'hu-cheng-he', category: '核心哲学', path: 'buffett/articles/keywords/hu-cheng-he.md', aliases: [], status: '已核验' },
];

describe('assembleArticle', () => {
  it('uses registry category and computes canonical url for a keyword article', () => {
    const a = assembleArticle(
      { id: 'keywords/hu-cheng-he', data: { title: '护城河', type: 'keyword', slug: 'hu-cheng-he' }, body: '正文[[安全边际]]' },
      entries,
    );
    expect(a.slug).toBe('hu-cheng-he');
    expect(a.type).toBe('keyword');
    expect(a.category).toBe('核心哲学');
    expect(a.url).toBe('/keywords/hu-cheng-he');
  });

  it('falls back to type-based category bucket for non-registry articles', () => {
    const a = assembleArticle(
      { id: 'questions/wei-shen-me', data: { title: '为什么', type: 'question', slug: 'wei-shen-me' }, body: '' },
      entries,
    );
    // question 不在 registry,category 用类型兜底标签
    expect(a.category).toBe('问题');
    expect(a.url).toBe('/articles/question/wei-shen-me');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd site && npx vitest run src/lib/articles.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 `site/src/lib/articles.ts`**

```ts
import { parseRegistry, type KeywordEntry } from './registry';
import { pathToUrl, slugFromPath } from './url';

export interface Article {
  slug: string;
  type: string;
  title: string;
  category: string;
  url: string;
  body: string;
  keywords: string[];
  related: string[];
  sourceTypes: string[];
}

// 非 registry 类型的兜底分类标签
const TYPE_CATEGORY: Record<string, string> = {
  'category-overview': '分类总论',
  'question': '问题',
  'timeline': '时间线',
};

interface RawEntry {
  id: string; // collection id, 形如 keywords/hu-cheng-he
  data: {
    title: string;
    type: string;
    slug: string;
    keywords?: string[];
    related?: string[];
    sourceTypes?: string[];
  };
  body: string;
}

/** 把一条 collection 记录 + registry 拼成统一文章模型。 */
export function assembleArticle(raw: RawEntry, entries: KeywordEntry[]): Article {
  const slug = raw.data.slug || slugFromPath(raw.id);
  const reg = entries.find((e) => e.slug === slug && e.path.endsWith(`${slug}.md`));
  const path = `buffett/articles/${raw.id}${raw.id.endsWith('.md') ? '' : '.md'}`;
  const url = pathToUrl(path);
  const category = reg?.category ?? TYPE_CATEGORY[raw.data.type] ?? raw.data.type;
  return {
    slug,
    type: raw.data.type,
    title: raw.data.title,
    category,
    url,
    body: raw.body ?? '',
    keywords: raw.data.keywords ?? [],
    related: raw.data.related ?? [],
    sourceTypes: raw.data.sourceTypes ?? [],
  };
}
```

> 注：Astro 5 的 glob loader 给的 `entry.id` 不含目录前缀时，需要用 `entry.filePath` 推导目录。实现时若 `id` 不含目录，改用 `entry.filePath`（形如 `../buffett/articles/keywords/hu-cheng-he.md`）来算 type/url。测试里用带目录的 `id` 锁定行为；页面层 Task 8 接入时按实际字段适配。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd site && npx vitest run src/lib/articles.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 6: 增补聚合导出（同文件追加）**

> 在 `articles.ts` 末尾追加运行时聚合函数，供页面调用。这些函数依赖 Astro 的 `getCollection`，无法在纯 Vitest 里测，靠 Task 8 的页面构建覆盖。

```ts
import { getCollection } from 'astro:content';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLookup } from './registry';
import { buildBacklinks, type ArticleRef } from './backlinks';
import { buildGraph } from './graph';

let _cache: {
  articles: Article[];
  entries: KeywordEntry[];
  keywordToSlug: Map<string, string>;
} | null = null;

async function load() {
  if (_cache) return _cache;
  const registryPath = fileURLToPath(new URL('../../../docs/keyword-registry.md', import.meta.url));
  const entries = parseRegistry(readFileSync(registryPath, 'utf8'));
  const collection = await getCollection('articles');
  const articles = collection.map((c: any) =>
    assembleArticle({ id: c.id, data: c.data, body: c.body }, entries),
  );
  // 关键词/别名 → 该关键词 canonical 文章 slug
  const lookup = buildLookup(entries);
  const keywordToSlug = new Map<string, string>();
  for (const [term, e] of lookup) keywordToSlug.set(term, e.slug);
  _cache = { articles, entries, keywordToSlug };
  return _cache;
}

export async function getArticles(): Promise<Article[]> {
  return (await load()).articles;
}

export async function getCategories(): Promise<{ name: string; articles: Article[] }[]> {
  const { articles } = await load();
  const order = ['核心哲学', '投资理念', '企业经营', '财务指标', '品格与心性', '公司', '行业', '人物', '保险、浮存金与风险', '市场周期与风险控制', '宏观经济与投资环境', '分类总论', '问题', '时间线'];
  const byCat = new Map<string, Article[]>();
  for (const a of articles) {
    if (!byCat.has(a.category)) byCat.set(a.category, []);
    byCat.get(a.category)!.push(a);
  }
  return order.filter((c) => byCat.has(c)).map((name) => ({ name, articles: byCat.get(name)! }));
}

export async function getBacklinks(slug: string): Promise<ArticleRef[]> {
  const { articles, keywordToSlug } = await load();
  const map = buildBacklinks(articles.map((a) => ({ slug: a.slug, title: a.title, url: a.url, body: a.body })), keywordToSlug);
  return map.get(slug) ?? [];
}

export async function getGraph() {
  const { articles, keywordToSlug } = await load();
  return buildGraph(
    articles.map((a) => ({ slug: a.slug, title: a.title, url: a.url, category: a.category, body: a.body })),
    keywordToSlug,
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add site/src/content.config.ts site/src/lib/articles.ts site/src/lib/articles.test.ts
git commit -m "feat(site): content collection and article assembly layer"
```

---

## Task 8: 设计 token + 三栏布局 + 文章/词条页

**Files:**
- Create: `site/src/styles/tokens.css`
- Create: `site/src/layouts/BaseLayout.astro`
- Create: `site/src/layouts/ArticleLayout.astro`
- Create: `site/src/components/Sidebar.astro`
- Create: `site/src/components/KeywordPanel.astro`
- Create: `site/src/components/Backlinks.astro`
- Create: `site/src/pages/keywords/[slug].astro`
- Create: `site/src/pages/articles/[type]/[slug].astro`

- [ ] **Step 1: 创建 `site/src/styles/tokens.css`（§10.3 设计 token）**

```css
:root {
  --paper: #f7f4ed;
  --panel: #fffdf8;
  --text: #25302b;
  --text-muted: #6f756e;
  --green: #486b55;
  --green-soft: #edf3ea;
  --quote-rule: #9b7a44;
  --max-read: 720px;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--paper); color: var(--text);
  font-family: "Noto Serif SC", "Songti SC", Georgia, serif; line-height: 1.75; }
a { color: var(--green); text-decoration: none; }
a:hover { text-decoration: underline; }
a.wikilink { border-bottom: 1px dotted var(--green); }
blockquote { border-left: 3px solid var(--quote-rule); margin: 1em 0; padding: 0.2em 1em;
  color: var(--text-muted); background: var(--green-soft); }
.layout { display: grid; grid-template-columns: 260px minmax(0, var(--max-read)) 280px;
  gap: 2rem; max-width: 1320px; margin: 0 auto; padding: 1.5rem; }
.reading { min-width: 0; }
.reading h1, .reading h2 { color: var(--green); }
.panel { background: var(--panel); border: 1px solid #e7e1d4; border-radius: 8px; padding: 1rem; }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .col-right { order: 3; }
}
```

- [ ] **Step 2: 创建 `site/src/layouts/BaseLayout.astro`（三栏框架）**

```astro
---
import '../styles/tokens.css';
import Sidebar from '../components/Sidebar.astro';
const { title } = Astro.props;
---
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · 巴菲特知识库</title>
  </head>
  <body>
    <div class="layout">
      <aside class="col-left"><Sidebar /></aside>
      <main class="reading"><slot /></main>
      <aside class="col-right"><slot name="aside" /></aside>
    </div>
  </body>
</html>
```

- [ ] **Step 3: 创建 `site/src/components/Sidebar.astro`（左栏：分类 + 搜索入口）**

```astro
---
import { getCategories } from '../lib/articles';
const categories = await getCategories();
---
<nav class="panel">
  <a href="/"><strong>巴菲特知识库</strong></a>
  <p style="color: var(--text-muted); font-size: 0.85rem;">慢慢读，反复看，用原文校准判断。</p>
  <form action="/search" method="get" role="search">
    <input type="search" name="q" placeholder="搜索关键词、文章…" style="width:100%;padding:0.4rem;" />
  </form>
  <ul style="list-style:none;padding:0;margin-top:1rem;">
    {categories.map((c) => (
      <li><a href={`/categories/${encodeURIComponent(c.name)}`}>{c.name}</a>
        <span style="color:var(--text-muted)"> · {c.articles.length}</span></li>
    ))}
  </ul>
  <p style="margin-top:1rem;"><a href="/graph">查看知识图谱 →</a></p>
</nav>
```

- [ ] **Step 4: 创建 `site/src/components/Backlinks.astro`**

```astro
---
import { getBacklinks } from '../lib/articles';
const { slug } = Astro.props;
const refs = await getBacklinks(slug);
---
{refs.length > 0 && (
  <section class="panel" style="margin-top:1rem;">
    <h3>引用这篇的文章（{refs.length}）</h3>
    <ul style="list-style:none;padding:0;">
      {refs.map((r) => <li><a href={r.url}>{r.title}</a></li>)}
    </ul>
  </section>
)}
```

- [ ] **Step 5: 创建 `site/src/components/KeywordPanel.astro`（右栏：关键词上下文）**

```astro
---
const { keywords = [], related = [], sourceTypes = [] } = Astro.props;
---
<div class="panel">
  {keywords.length > 0 && (<><h3>核心关键词</h3><ul>{keywords.map((k) => <li>{k}</li>)}</ul></>)}
  {related.length > 0 && (<><h3>关联</h3><ul>{related.map((r) => <li>{r}</li>)}</ul></>)}
  {sourceTypes.length > 0 && (<><h3>原文来源类型</h3><p style="color:var(--text-muted)">{sourceTypes.join(' · ')}</p></>)}
</div>
```

- [ ] **Step 6: 创建 `site/src/layouts/ArticleLayout.astro`（正文骨架，被两类页复用）**

```astro
---
import BaseLayout from './BaseLayout.astro';
import KeywordPanel from '../components/KeywordPanel.astro';
import Backlinks from '../components/Backlinks.astro';
const { article, Content } = Astro.props;
---
<BaseLayout title={article.title}>
  <article>
    <h1>{article.title}</h1>
    <p style="color:var(--text-muted)">{article.category}</p>
    <Content />
  </article>
  <KeywordPanel slot="aside" keywords={article.keywords} related={article.related} sourceTypes={article.sourceTypes} />
  <Backlinks slot="aside" slug={article.slug} />
</BaseLayout>
```

- [ ] **Step 7: 创建 `site/src/pages/keywords/[slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import { getArticles } from '../../lib/articles';
import ArticleLayout from '../../layouts/ArticleLayout.astro';

export async function getStaticPaths() {
  const articles = await getArticles();
  const collection = await getCollection('articles');
  return articles
    .filter((a) => a.type === 'keyword')
    .map((a) => {
      const entry = collection.find((c: any) => c.data.slug === a.slug && c.data.type === 'keyword');
      return { params: { slug: a.slug }, props: { article: a, entry } };
    });
}

const { article, entry } = Astro.props;
const { Content } = await render(entry);
---
<ArticleLayout article={article} Content={Content} />
```

- [ ] **Step 8: 创建 `site/src/pages/articles/[type]/[slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import { getArticles } from '../../../lib/articles';
import ArticleLayout from '../../../layouts/ArticleLayout.astro';

export async function getStaticPaths() {
  const articles = await getArticles();
  const collection = await getCollection('articles');
  return articles
    .filter((a) => a.type !== 'keyword')
    .map((a) => {
      const entry = collection.find((c: any) => c.data.slug === a.slug && c.data.type === a.type);
      return { params: { type: a.type, slug: a.slug }, props: { article: a, entry } };
    });
}

const { article, entry } = Astro.props;
const { Content } = await render(entry);
---
<ArticleLayout article={article} Content={Content} />
```

- [ ] **Step 9: 构建验证：所有 182 篇文章页 + wiki-link 渲染正常**

Run: `cd site && npx astro build`
Expected: 成功。`dist/keywords/` 下 121 个目录、`dist/articles/` 下按 6 类共 61 个页面。

Run: `cd site && grep -l 'class="wikilink"' dist/keywords/hu-cheng-he/index.html`
Expected: 命中（护城河页正文里的 `[[...]]` 已渲染为带 `wikilink` class 的链接）。

- [ ] **Step 10: Commit**

```bash
git add site/src/styles site/src/layouts site/src/components/Sidebar.astro site/src/components/KeywordPanel.astro site/src/components/Backlinks.astro site/src/pages/keywords site/src/pages/articles
git commit -m "feat(site): design tokens, three-column layout, article and keyword pages"
```

---

## Task 9: 首页 + 分类页

**Files:**
- Modify: `site/src/pages/index.astro`（替换占位）
- Create: `site/src/pages/categories/[category].astro`

- [ ] **Step 1: 替换 `site/src/pages/index.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getCategories, getArticles } from '../lib/articles';
const categories = await getCategories();
const overviews = (await getArticles()).filter((a) => a.type === 'category-overview');
---
<BaseLayout title="首页">
  <section>
    <h1>巴菲特知识库</h1>
    <p>以 284 篇巴菲特原文为基础整理的知识库。先原文，后观点；先证据，后文章。</p>
    <h2>从分类总论开始</h2>
    <ul>
      {overviews.map((a) => <li><a href={a.url}>{a.title}</a></li>)}
    </ul>
    <h2>全部分类</h2>
    <ul>
      {categories.map((c) => (
        <li><a href={`/categories/${encodeURIComponent(c.name)}`}>{c.name}</a>
          <span style="color:var(--text-muted)"> · {c.articles.length} 篇</span></li>
      ))}
    </ul>
  </section>
</BaseLayout>
```

- [ ] **Step 2: 创建 `site/src/pages/categories/[category].astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { getCategories } from '../../lib/articles';

export async function getStaticPaths() {
  const categories = await getCategories();
  return categories.map((c) => ({ params: { category: c.name }, props: { category: c } }));
}
const { category } = Astro.props;
---
<BaseLayout title={category.name}>
  <section>
    <h1>{category.name}</h1>
    <ul>
      {category.articles.map((a) => <li><a href={a.url}>{a.title}</a></li>)}
    </ul>
  </section>
</BaseLayout>
```

- [ ] **Step 3: 构建验证**

Run: `cd site && npx astro build`
Expected: 成功；`dist/categories/` 下生成 11 个 registry 分类目录（中文名 URL 编码）。

Run: `cd site && ls dist/categories | wc -l`
Expected: ≥ 11。

- [ ] **Step 4: Commit**

```bash
git add site/src/pages/index.astro site/src/pages/categories
git commit -m "feat(site): home page and category pages"
```

---

## Task 10: 知识图谱页（Cytoscape island）

**Files:**
- Create: `site/src/components/graph-client.ts`
- Create: `site/src/components/GraphView.astro`
- Create: `site/src/pages/graph.astro`

- [ ] **Step 1: 创建 `site/src/components/graph-client.ts`（浏览器端 Cytoscape 初始化）**

```ts
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
cytoscape.use(coseBilkent);

const CATEGORY_COLORS: Record<string, string> = {
  '核心哲学': '#486b55', '投资理念': '#6a8d73', '企业经营': '#9b7a44',
  '财务指标': '#8a8f5a', '品格与心性': '#a86f5c', '公司': '#5c7a99',
  '行业': '#7a6c99', '人物': '#b08968', '保险、浮存金与风险': '#5a8f8a',
  '市场周期与风险控制': '#99635c', '宏观经济与投资环境': '#6f756e',
};

export function initGraph(container: HTMLElement, data: { nodes: any[]; edges: any[] }) {
  const elements = [
    ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label, category: n.category, url: n.url, size: 14 + Math.min(n.indegree, 20) * 2 } })),
    ...data.edges.map((e) => ({ data: { source: e.source, target: e.target } })),
  ];
  const cy = cytoscape({
    container,
    elements,
    style: [
      { selector: 'node', style: {
        'background-color': (ele: any) => CATEGORY_COLORS[ele.data('category')] ?? '#6f756e',
        'label': 'data(label)', 'font-size': 8, 'width': 'data(size)', 'height': 'data(size)',
        'color': '#25302b', 'text-valign': 'bottom' } },
      { selector: 'edge', style: { 'width': 1, 'line-color': '#cfc6b3', 'curve-style': 'bezier',
        'target-arrow-shape': 'triangle', 'target-arrow-color': '#cfc6b3', 'arrow-scale': 0.6 } },
      { selector: 'node:active, node.hl', style: { 'border-width': 2, 'border-color': '#9b7a44' } },
    ],
    layout: { name: 'cose-bilkent', animate: false, idealEdgeLength: 80, nodeRepulsion: 4500 } as any,
  });
  cy.on('tap', 'node', (evt) => { const url = evt.target.data('url'); if (url) window.location.href = url; });
  return cy;
}
```

- [ ] **Step 2: 创建 `site/src/components/GraphView.astro`**

> 把 graph 数据序列化进页面，island 脚本读取后渲染。可选 `category` 过滤参数；不传则全站。

```astro
---
import { getGraph } from '../lib/articles';
const { category } = Astro.props;
let { nodes, edges } = await getGraph();
if (category) {
  const keep = new Set(nodes.filter((n) => n.category === category).map((n) => n.id));
  // 保留与该分类相关的一跳邻居
  for (const e of edges) { if (keep.has(e.source)) keep.add(e.target); if (keep.has(e.target)) keep.add(e.source); }
  nodes = nodes.filter((n) => keep.has(n.id));
  edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
}
const data = JSON.stringify({ nodes, edges });
---
<div id="graph" style="height:75vh;border:1px solid #e7e1d4;border-radius:8px;background:var(--panel);"></div>
<script define:vars={{ data }}>
  import('/src/components/graph-client.ts').then(({ initGraph }) => {
    initGraph(document.getElementById('graph'), JSON.parse(data));
  });
</script>
```

> 注：Astro 的 `<script>` 内动态 import 源码路径在生产构建下需走打包。更稳的写法是用 Astro 的脚本打包：把 import 写成顶层、用 `is:inline` 之外的常规 `<script>`，并通过 `data-graph` 属性传 JSON。实现时如遇路径问题，改为：常规 `<script>` 顶层 `import { initGraph } from './graph-client.ts'`，数据放在 `<div id="graph" data-graph={data}>`，脚本读 `document.getElementById('graph').dataset.graph`。

- [ ] **Step 3: 创建 `site/src/pages/graph.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import GraphView from '../components/GraphView.astro';
---
<BaseLayout title="知识图谱">
  <section>
    <h1>知识图谱</h1>
    <p style="color:var(--text-muted)">点击节点进入文章。节点按分类着色，越大表示被引用越多。</p>
    <GraphView />
  </section>
</BaseLayout>
```

- [ ] **Step 4: 构建并人工验证图谱**

Run: `cd site && npx astro build && npx astro preview`
Expected: 构建成功。浏览器打开 preview 给出的本地地址 `/graph`，能看到约 182 个节点的力导向图、按分类着色、点击节点跳转文章。**这是人工验收点**——记录是否渲染、是否可点击。

- [ ] **Step 5: Commit**

```bash
git add site/src/components/graph-client.ts site/src/components/GraphView.astro site/src/pages/graph.astro
git commit -m "feat(site): full-site knowledge graph with Cytoscape"
```

---

## Task 11: 词条页局部图 + 「来源」视图 + 三视图切换

**Files:**
- Create: `site/src/components/SourceMatrix.astro`
- Modify: `site/src/pages/keywords/[slug].astro`（加局部图 + 来源视图入口）
- Modify: `site/src/layouts/ArticleLayout.astro`（加阅读/图谱/来源切换）

- [ ] **Step 1: 创建 `site/src/components/SourceMatrix.astro`（读取 docs/source-matrices）**

```astro
---
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { slug } = Astro.props;
const p = fileURLToPath(new URL(`../../../docs/source-matrices/${slug}.md`, import.meta.url));
const raw = existsSync(p) ? readFileSync(p, 'utf8') : '';
---
<section class="panel">
  <h3>来源矩阵</h3>
  {raw ? <pre style="white-space:pre-wrap;font-size:0.85rem">{raw}</pre> : <p style="color:var(--text-muted)">暂无来源矩阵文件。</p>}
</section>
```

> 注：`source-matrices` 是 Markdown 表格；v1 先原样展示。若想渲染成表格，可在后续迭代用 marked/remark 转 HTML，这里 YAGNI。

- [ ] **Step 2: 在 `ArticleLayout.astro` 加三视图切换（阅读/图谱/来源）**

> 用纯 CSS + 单选切换：三个 section，默认显示「阅读」。图谱与来源用 `<details>` 或简单 JS 切换。这里用最小 JS。

替换 `ArticleLayout.astro` 正文区为：

```astro
---
import BaseLayout from './BaseLayout.astro';
import KeywordPanel from '../components/KeywordPanel.astro';
import Backlinks from '../components/Backlinks.astro';
import SourceMatrix from '../components/SourceMatrix.astro';
import GraphView from '../components/GraphView.astro';
const { article, Content } = Astro.props;
---
<BaseLayout title={article.title}>
  <nav class="views" style="margin-bottom:1rem;display:flex;gap:0.75rem;">
    <button data-view="read" class="view-btn">阅读</button>
    <button data-view="graph" class="view-btn">图谱</button>
    <button data-view="source" class="view-btn">来源</button>
  </nav>
  <article data-view-pane="read">
    <h1>{article.title}</h1>
    <p style="color:var(--text-muted)">{article.category}</p>
    <Content />
  </article>
  <div data-view-pane="graph" hidden>
    <h2>{article.category} 局部关系</h2>
    <GraphView category={article.category} />
  </div>
  <div data-view-pane="source" hidden>
    <SourceMatrix slug={article.slug} />
  </div>
  <KeywordPanel slot="aside" keywords={article.keywords} related={article.related} sourceTypes={article.sourceTypes} />
  <Backlinks slot="aside" slug={article.slug} />
</BaseLayout>
<script>
  const btns = document.querySelectorAll('.view-btn');
  const panes = document.querySelectorAll('[data-view-pane]');
  btns.forEach((b) => b.addEventListener('click', () => {
    const v = b.getAttribute('data-view');
    panes.forEach((p) => (p.hidden = p.getAttribute('data-view-pane') !== v));
  }));
</script>
```

- [ ] **Step 3: 构建验证**

Run: `cd site && npx astro build`
Expected: 成功。

Run: `cd site && grep -c 'data-view-pane' dist/keywords/hu-cheng-he/index.html`
Expected: ≥ 3（阅读/图谱/来源三个 pane 都渲染进页面）。

- [ ] **Step 4: 人工验收三视图切换 + 词条局部图**

Run: `cd site && npx astro preview`
打开 `/keywords/hu-cheng-he`，点「图谱」「来源」「阅读」三个按钮切换。**人工验收点**：切换正常、局部图只含核心哲学分类及一跳邻居、来源矩阵显示该 slug 文件内容。

- [ ] **Step 5: Commit**

```bash
git add site/src/components/SourceMatrix.astro site/src/layouts/ArticleLayout.astro site/src/pages/keywords/[slug].astro
git commit -m "feat(site): source matrix view, local graph, reading/graph/source toggle"
```

---

## Task 12: 全文搜索（Pagefind）

**Files:**
- Create: `site/src/pages/search.astro`

Pagefind 在 build 后扫描 `dist/` 自动生成索引（已在 Task 1 的 build 脚本里 `pagefind --site dist`）。搜索页加载 Pagefind UI。

- [ ] **Step 1: 给文章正文容器加 `data-pagefind-body`（让 Pagefind 只索引正文）**

修改 `ArticleLayout.astro` 的 `<article data-view-pane="read">` 为：

```astro
  <article data-view-pane="read" data-pagefind-body>
```

- [ ] **Step 2: 创建 `site/src/pages/search.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="搜索">
  <section>
    <h1>搜索</h1>
    <link href="/pagefind/pagefind-ui.css" rel="stylesheet" />
    <div id="search"></div>
    <script>
      window.addEventListener('DOMContentLoaded', () => {
        new (window as any).PagefindUI({ element: '#search', showSubResults: true, translations: { placeholder: '搜索关键词、文章…' } });
      });
    </script>
    <script src="/pagefind/pagefind-ui.js" is:inline></script>
  </section>
</BaseLayout>
```

- [ ] **Step 3: 全量 build（含 pagefind）并验证索引生成**

Run: `cd site && npx astro build && npx pagefind --site dist`
Expected: 成功，生成 `dist/pagefind/` 目录（含 `pagefind-ui.js`、`pagefind-ui.css`、索引分片）。

Run: `cd site && ls dist/pagefind/pagefind-ui.js`
Expected: 文件存在。

- [ ] **Step 4: 人工验收搜索**

Run: `cd site && npx astro preview`
打开 `/search`，搜「护城河」「浮存金」「GEICO」。**人工验收点**：返回中文结果且能点进文章。

- [ ] **Step 5: Commit**

```bash
git add site/src/pages/search.astro site/src/layouts/ArticleLayout.astro
git commit -m "feat(site): full-text search via Pagefind"
```

---

## Task 13: 内容校验脚本

**Files:**
- Create: `site/scripts/validate-content.mjs`

实现 §11.3 校验：frontmatter 完整、type 合法、slug 唯一、wiki-link/keywords/related 可解析、来源矩阵与原话卡片存在。失败退出码非 0，阻断 build。

- [ ] **Step 1: 创建 `site/scripts/validate-content.mjs`**

```js
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRegistry, buildLookup } from '../src/lib/registry.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VALID_TYPES = new Set(['category-overview', 'keyword', 'company', 'industry', 'person', 'question', 'timeline']);
const DIRS = ['category-overviews', 'keywords', 'companies', 'industries', 'people', 'questions', 'timelines'];

const errors = [];
const warnings = [];

const lookup = buildLookup(parseRegistry(readFileSync(root + 'docs/keyword-registry.md', 'utf8')));

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (mm) fm[mm[1]] = mm[2];
  }
  return fm;
}

const seenSlugs = new Set();
for (const dir of DIRS) {
  const base = root + 'buffett/articles/' + dir;
  for (const file of readdirSync(base).filter((f) => f.endsWith('.md'))) {
    const path = `${base}/${file}`;
    const slug = file.replace(/\.md$/, '');
    const text = readFileSync(path, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) { errors.push(`${path}: 缺少 frontmatter`); continue; }
    if (!fm.title) errors.push(`${path}: 缺少 title`);
    if (!VALID_TYPES.has(fm.type)) errors.push(`${path}: 非法 type "${fm.type}"`);
    if (fm.slug !== slug) errors.push(`${path}: slug "${fm.slug}" 与文件名 "${slug}" 不一致`);
    if (seenSlugs.has(`${fm.type}/${slug}`)) errors.push(`${path}: 重复 slug ${slug}`);
    seenSlugs.add(`${fm.type}/${slug}`);

    // wiki-link 全部可解析
    for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const kw = m[1].split('|')[0].trim();
      if (!lookup.get(kw)) errors.push(`${path}: 死链 [[${kw}]]`);
    }
    // 来源矩阵 + 原话卡片存在
    if (!existsSync(`${root}docs/source-matrices/${slug}.md`)) warnings.push(`${path}: 缺来源矩阵`);
    if (!existsSync(`${root}docs/quote-cards/${slug}.md`)) warnings.push(`${path}: 缺原话卡片`);
  }
}

for (const w of warnings) console.warn('⚠ ', w);
if (errors.length) {
  for (const e of errors) console.error('✗ ', e);
  console.error(`\n校验失败: ${errors.length} 个错误。`);
  process.exit(1);
}
console.log(`✓ 校验通过 (${seenSlugs.size} 篇文章, ${warnings.length} 个警告)。`);
```

> 注：脚本 import `.ts`。若 `node scripts/validate-content.mjs` 不能直接 import `.ts`，两种降级：(a) 用 `npx tsx scripts/validate-content.mjs` 并把 tsx 加进 devDependencies；(b) 在脚本内内联一份 registry 解析逻辑（复制 Task 2 的 parseRegistry/buildLookup 几行）。优先 (a)：`cd site && npm i -D tsx`，并把 build 脚本里的 `node scripts/...` 改为 `tsx scripts/...`。

- [ ] **Step 2: 运行校验脚本**

Run: `cd site && npx tsx scripts/validate-content.mjs`
Expected: `✓ 校验通过 (182 篇文章, …个警告)`，退出码 0。

- [ ] **Step 3: 验证 build 脚本串起校验**

Run: `cd site && npm run build`
Expected: 先跑校验（通过），再 astro build，再 pagefind。全绿。

- [ ] **Step 4: Commit**

```bash
git add site/scripts/validate-content.mjs site/package.json site/package-lock.json
git commit -m "feat(site): content validation script wired into build"
```

---

## Task 14: Cloudflare Pages 部署配置 + 文档

**Files:**
- Create: `site/README.md`
- Create: `site/public/_routes.json`（可选，纯静态可省）

- [ ] **Step 1: 创建 `site/README.md`（部署说明）**

```markdown
# 巴菲特知识库网站

Astro 静态站，读取 `../buffett/articles` 与 `../docs/keyword-registry.md`。

## 本地
- `npm install`
- `npm run dev` — 开发
- `npm run build` — 校验 + 构建 + 生成搜索索引到 `dist/`
- `npm run preview` — 预览 `dist/`

## Cloudflare Pages 设置
- Connect 仓库
- **Root directory**: `site`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- Node 版本: 设环境变量 `NODE_VERSION=22`
- 部署后把 `astro.config.mjs` 的 `site` 改成实际域名
```

- [ ] **Step 2: 最终全量验证**

Run: `cd site && rm -rf dist && npm run build && npx astro preview`
Expected: 全流程绿。打开首页，逐项过验收（见下）。

- [ ] **Step 3: 人工验收清单（§11.4 / §13）**

逐项确认（这是人工验收点，记录结果）：
- [ ] 首页能进任一分类；分类页能进文章。
- [ ] 文章正文 `[[关键词]]` 可点击 → 词条页。
- [ ] 词条页显示反向链接，能跳回引用它的文章。
- [ ] 搜索可用（关键词/标题/正文，中文）。
- [ ] 阅读/图谱/来源三视图可切换；全站图谱可点节点跳转。
- [ ] 移动端（窄屏）单栏、不溢出。
- [ ] 配色为暖纸色系，无营销化装饰。

- [ ] **Step 4: Commit**

```bash
git add site/README.md
git commit -m "docs(site): deployment guide and final verification"
```

---

## 完成标准

- `cd site && npm run build` 全绿（校验 0 错误 + astro build 0 死链 + pagefind 索引生成）。
- 182 篇文章页 + 121 词条页 + 11 分类页 + 首页 + 图谱页 + 搜索页全部生成。
- §11.4 / §13 人工验收清单全部通过。
- 推送后 Cloudflare Pages 按 README 设置可部署。
