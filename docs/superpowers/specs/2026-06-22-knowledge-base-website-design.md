# 巴菲特知识库网站 — 设计方案 (Spec)

> 日期：2026-06-22
> 范围：执行 master TODO 的 §10/§11/§12.6「网站化」部分。内容层（182 篇文章、关键词注册表、来源矩阵、原话卡片、wiki-link）已 100% 就绪，本方案只解决「把已备好的 Markdown 知识库做成网站」。

## 已确认决策

| 维度 | 决策 |
| --- | --- |
| 技术栈 | **Astro**（原生 Markdown、输出纯静态、islands 做局部交互） |
| 部署目标 | **Cloudflare Pages**（git 推送自动部署） |
| 知识图谱 | **v1 即包含全站知识图谱** |
| 搜索 | **客户端全文索引（Pagefind）** |
| 图谱渲染库 | **Cytoscape.js**（`cose-bilkent` 力导向布局） |
| Astro 应用位置 | 新建 `site/` 子目录，相对路径读取 `../buffett`、`../docs` |

## 目标与原则

- 内容（`buffett/`）与管理文件（`docs/`）**原地不动**，网站层独立在 `site/`。
- 全站 `[[关键词]]` 可点击跳转，并生成反向链接与知识图谱。
- 视觉沿用既有 HTML 原型与 §10.3 设计 token，不做营销化页面，第一屏即知识库界面。
- 死链零容忍：解析不到的 `[[关键词]]` 在构建期报错。

---

## 1. 总体架构与目录

```text
website_buffett/
├── buffett/articles/**/*.md          # 数据源(不动)
├── docs/keyword-registry.md          # wiki-link 解析表(不动)
├── docs/article-index.md             # 文章索引(不动)
└── site/                             # 新增:Astro 应用
    ├── astro.config.mjs
    ├── package.json
    ├── src/
    │   ├── content.config.ts         # glob loader 指向 ../buffett/articles
    │   ├── lib/
    │   │   ├── registry.ts           # 解析 keyword-registry.md → Map
    │   │   ├── remark-wikilink.ts    # [[关键词]] → <a> 的 remark 插件
    │   │   ├── graph.ts              # 构建全站图谱 nodes/edges
    │   │   └── backlinks.ts          # 反向链接索引
    │   ├── layouts/                  # 三栏布局(移植原型)
    │   ├── components/               # WikiLink/Backlinks/KeywordPanel/GraphView/Search
    │   ├── pages/                    # 路由(见 §3)
    │   └── styles/tokens.css         # §10.3 设计 token
    └── scripts/validate-content.mjs  # §11.3 校验脚本
```

**Cloudflare Pages 配置**：Root directory = `site/`，Build command = `npm run build`，Output directory = `site/dist`。站点部署在 CF 子域名根路径，无需子路径 `base`。

---

## 2. 内容管线与 wiki-link 解析（核心）

**① 注册表 = 唯一解析表。** 构建期把 `docs/keyword-registry.md` 解析成 `Map<关键词|别名 → {slug, 分类, 词条路径, url}>`。154 条关键词及其别名（英文名、简称、近义表达，如 `Economic Moat`、`经济护城河`）全部入表。

**② remark 插件转链接。** 在 Markdown→HTML 阶段处理两种语法：

- `[[护城河]]` → `<a href="/keywords/hu-cheng-he">护城河</a>`
- `[[避免永久性损失|永久性损失]]` → 链接到 canonical，显示文本取管道符右侧

解析不到的 `[[X]]` → **构建报错**（满足 §5.2「没有链接到不存在的关键词」）。

**③ 反向链接索引。** 扫描全部 182 篇正文，建 `keyword → [引用它的文章]` 反向表，驱动词条页「哪些文章引用了我」。`frontmatter.related` 与 `keywords` 提供额外的显式关联边。

---

## 3. 页面与路由（§10.1）

| 路由 | 页面 | 数据来源 |
| --- | --- | --- |
| `/` | 首页：定位 + 11 分类入口 + 推荐阅读 + 搜索框 | article-index |
| `/categories/[category]` | 分类页：该类下所有文章 | frontmatter.category |
| `/keywords/[slug]` | 词条页：定义/原文证据/案例/误解/反向链接/局部关系（**仅** `type: keyword` 的 121 篇走此路由） | 文章 + 反向链接索引 |
| `/articles/[type]/[slug]` | 文章详情页（category-overview / company / industry / person / question / timeline 六类共用模板，右栏关键词上下文） | content collection |
| `/graph` | 全站知识图谱 | graph.json |
| `/search` | 搜索页 | Pagefind 索引 |

为避免同一文章出现两个 URL：`type: keyword` 的文章**只**在 `/keywords/[slug]`，其余六类**只**在 `/articles/[type]/[slug]`。`docs/keyword-registry.md` 中 `词条路径` 指向 keyword 文章的，其 canonical URL 即 `/keywords/[slug]`；指向公司/人物等文章的（如「伯克希尔」「查理·芒格」），canonical URL 为对应的 `/articles/[type]/[slug]`。remark 插件按注册表里的 `词条路径` 反推目标 URL，二者保持一致。

公司/人物/行业/问题/时间线页复用文章详情模板（它们本就是 `buffett/articles/{companies,people,...}` 下的文章），用 frontmatter `type` 区分右栏呈现。

---

## 4. 全站知识图谱（v1）

**数据模型（构建期生成 `graph.json`）**：

- **节点** = 182 篇文章，按 11 个分类着色，节点大小按入度（被引用次数）。
- **边** = 文章 A 正文 `[[关键词]]` 指向的 canonical 文章 B（有向），加 `related` 显式关联，去重。

**渲染**：Cytoscape.js + `cose-bilkent` 力导向布局。交互：点击节点跳转对应文章、按分类筛选、hover 高亮邻居。作为 Astro island（`client:visible`），仅在 `/graph` 与词条页局部图加载，不拖累纯阅读页。

> 备选 Sigma.js + graphology（WebGL，性能天花板更高）。当前 ~336 节点规模 Cytoscape 足够；若未来节点数涨到上千再迁移。

---

## 5. 搜索（§10.2）

**Pagefind**：构建后扫描 `dist/` 自动生成分块索引，原生支持中文（CJK）分词，运行时按需下载索引分片，首屏零负担。选它而非 Fuse.js 的原因：Fuse 需把整份索引打进客户端 bundle，182 篇全文会偏大。

---

## 6. 视觉（移植原型，§10.3）

把原型设计 token 抽成 `tokens.css`：

- 背景纸色 `#f7f4ed`、面板 `#fffdf8`、正文 `#25302b`、次级文字 `#6f756e`、主绿 `#486b55`、柔和绿 `#edf3ea`、茶色引用线 `#9b7a44`。

三栏布局做成 Astro layout：

- 桌面：左（分类+搜索）/ 中（阅读）/ 右（关键词上下文）。
- 移动：单栏，右栏折叠。
- 「阅读 / 图谱 / 来源」三视图切换（§10.2）。
- 所有文字不溢出容器；保持资料密度但避免压迫感。

---

## 7. 校验脚本（§11.3 + §13）

`site/scripts/validate-content.mjs`，可独立运行，也挂在 build 前：

- frontmatter 完整、`type` 合法、`slug` 唯一且与文件名一致。
- 每个 `[[关键词]]` / `keywords` / `related` 都能在注册表解析。
- 每篇的来源矩阵、原话卡片文件存在。
- 内容配额（5-7 句主引用、~5 案例/误解/延伸阅读）→ 仅警告，不阻断构建。

---

## 8. 组件清单与职责

| 组件 | 职责 | 依赖 |
| --- | --- | --- |
| `BaseLayout` | 三栏框架、头部、视图切换 | tokens.css |
| `WikiLink`（remark 产物） | 渲染可点击关键词链接 | registry.ts |
| `Backlinks` | 列出引用当前词条的文章 | backlinks.ts |
| `KeywordPanel`（右栏） | 当前文章的关键词上下文 | frontmatter + registry |
| `GraphView`（island） | Cytoscape 图谱渲染与筛选 | graph.json |
| `Search`（island） | Pagefind UI | Pagefind 索引 |
| `SourceMatrixView` | 「来源」视图：展示来源矩阵 | docs/source-matrices |

每个单元单一职责、通过明确接口通信、可独立理解与测试。

---

## 9. 实施阶段

1. **脚手架**：Astro 项目 + content collection 指向 `../buffett/articles` + 设计 token + 三栏 layout。
2. **核心管线**：registry 解析 + remark wiki-link 插件 + 文章详情页 + 分类页。
3. **关联**：反向链接索引 + 词条页 + 右栏关键词上下文。
4. **搜索**：接入 Pagefind。
5. **图谱**：graph.json 构建 + Cytoscape island + 分类筛选 + 词条页局部图。
6. **校验 + 部署**：校验脚本 + Cloudflare Pages 配置。
7. **打磨**：移动端单栏、三视图切换、无溢出、可访问性、首页。

---

## 10. 验收标准（§11.4 / §13）

- 用户能从首页进任一分类，从分类页进文章。
- 点击正文 `[[关键词]]` 跳转到词条页；词条页显示定义、来源、反向链接，并可跳回引用它的文章。
- 全站搜索可用（关键词、文章标题、正文）。
- 「阅读 / 图谱 / 来源」三视图可切换；全站图谱可按分类筛选、点节点跳转。
- 移动端能完整阅读，布局不溢出。
- 配色保持温馨、理性、平常心，无营销化/浮夸装饰。
- 构建期校验通过：无死链、slug 唯一、frontmatter 完整。

---

## 11. 范围之外（v2+）

- 自动从原文语料（`berkshire/`、`interview/`、`shareholders/`）生成更细的来源跳转锚点。
- 个性化推荐、阅读进度、收藏。
- 图谱迁移到 WebGL（仅当节点规模显著增长）。
