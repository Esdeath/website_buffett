# 巴菲特知识库项目分析（website_buffett）

> 分析日期：2026-07-08 · 分析人：WorkBuddy

## 1. 项目定位

中文「巴菲特知识库」，基于 **Astro 5** 的静态站点。把巴菲特原始资料（致股东/合伙人信、访谈、股东会实录）与编辑解读（关键词、公司、人物、行业等）组织成**可交叉引用、可图谱化、可检索**的知识系统，部署在 Cloudflare Pages。

与 `learnbuffett.com`（Nuxt/Vue 英文站，151 篇访谈）对照：本仓库是中文版，技术栈更现代（Astro + Pagefind + Cytoscape 知识图谱），内容组织更偏"知识库"而非"文档站"。两者内容量级相近（访谈都是 151 篇），疑似同源双栈。

## 2. 技术栈

| 维度 | 选型 |
|------|------|
| 框架 | Astro 5（静态生成） |
| 搜索 | Pagefind 全文索引 |
| 图谱 | Cytoscape + cose-bilkent 客户端渲染 |
| OG 图 | astro-og-canvas（每页 1200×630） |
| 测试 | Vitest（colocated `*.test.ts`），tsx 跑校验脚本 |
| 扩展 | 自定义 remark 插件（wikilink / autolink / strip-title） |
| 部署 | Cloudflare Pages，根目录 `site`，`NODE_VERSION=22` |

## 3. 架构亮点（核心）

- **内容与站点分离**：`buffett/`、`docs/` 是内容真源；`site/` 是独立 npm 包，通过相对路径 `../buffett` 读取。改内容不必碰前端。
- **关键词注册表是单一真相源**（`docs/keyword-registry.md`）：决定分类、canonical URL、别名解析。未注册的关键词文章会**直接让构建失败**。
- **交叉引用系统**：`remark-wikilink` 解析 `[[关键词]]`，死链即阻断构建；`remark-autolink` 在原始资料里自动链接首个命中（最长匹配优先）。
- **校验门禁**：`build = sync-images → validate-content（frontmatter/slug/死链）→ astro build → pagefind`。validate 失败即阻断发布。
- **派生数据自动生成**：backlinks、knowledge graph、OG 图、`llms.txt` / `llms-full.txt`、sitemap 全由源码产出。
- **不变量**：`filename === frontmatter.slug`，slug 全局唯一。

## 4. 内容规模与成熟度

**总量**

| 类别 | 数量 |
|------|------|
| 编辑文章（7 类） | 182 篇（关键词 121 / 公司 14 / 人物 13 / 分类概览 12 / 时间线 7 / 问答 10 / 行业 5） |
| 原始资料 | 284 篇（伯克希尔 100 / 访谈 151 / 股东会 33） |
| registry 关键词 | 152 条 |
| 配套 quote-cards / source-matrices | 各 182 |
| 图片 | 58 张 |

**关键词成熟度（registry 状态）**

| 状态 | 数量 | 占比 |
|------|------|------|
| 已核验 | 80 | 52% |
| 初稿完成 | 29 | 19% |
| 未开始 | 43 | 28% |

**分类覆盖（11 类）**：财务指标 18 / 品格与心性 17 / 核心哲学 16 / 投资理念 16 / 企业经营 16 / 市场周期与风控 13 / 宏观环境 13 / 公司 13 / 人物 13 / 保险浮存金 12 / 行业 5。

## 5. 工程质量信号（正面）

- `CLAUDE.md` 详尽（命令、架构、踩坑），新人可快速上手。
- 测试齐全：registry / wikilink / backlinks / graph / seo / url / excerpt 均有单测，`astro:content` 用 mock 隔离。
- 内容校验门禁，发布可靠、可追溯。
- git 活跃，最近在改响应式（手机抽屉导航、小屏表格/图片保护、断点适配），前端仍在打磨。
- 中文内容 + ASCII 拼音 slug，SEO 友好、无编码问题。

## 6. 机会 / 风险 / 建议

1. **内容缺口明确**：43 个"未开始"关键词（28%）是现成的待写清单；`行业`类仅 5 个，明显偏薄，可优先补。
2. **registry 与文章数对不齐**：关键词文章 121 篇 vs registry 152 条，差额 31 可能是已注册未写文章的占位。建议确认这些占位是否都在规划内，避免 registry 虚胖。
3. **双站关系未打通**：本仓库（中文 Astro）与 `learnbuffett.com`（英文 Nuxt）内容同源。建议明确是否做 i18n 或共享原始资料，避免重复维护。
4. **CI 缺失**：校验目前只在 build 脚本里。建议加 PR 门禁跑 `npm run validate` + `npm test`，防止内容回归。
5. **仓库卫生**：`site/` 含 node_modules 及 12000+ 文件，确认 `.gitignore` 已排除 `node_modules/`、`dist/`、`public/images/`（CLAUDE.md 已说明后者为生成物）。
