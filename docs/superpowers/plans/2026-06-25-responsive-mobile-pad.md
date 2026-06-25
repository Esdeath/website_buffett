# 移动端 / 平板端响应式适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让巴菲特知识库站点在手机（抽屉式目录）和平板（保留侧栏）上布局合理、可读、可导航，桌面端不变。

**Architecture:** 在 `tokens.css` 用 CSS Grid 命名区域（`nav`/`main`/`aside`）描述三栏，按三档断点（桌面 ≥1200、平板 768–1199、手机 <768）重排区域，DOM 顺序不动。手机端 `BaseLayout.astro` 增加固定顶栏 + 左侧抽屉，由一段极简内联脚本切换 `body.nav-open`。

**Tech Stack:** Astro 5 静态站、纯 CSS（媒体查询 + Grid 命名区域）、原生 DOM 脚本。无新增依赖。

**测试说明：** 本次为 CSS 响应式 + 少量 DOM 交互，仓库现有 vitest 仅覆盖 `lib` 逻辑，无 CSS/DOM 测试设施，新增此类单测无意义。每个任务的验证 = `npm run build` 通过（捕获 Astro/语法错误）+ 在指定视口宽度目测。最后一个任务做完整跨页型、跨视口核对。所有命令在 `site/` 目录下执行。

---

### Task 1: 重构布局网格为命名区域 + 平板/手机断点

把 `tokens.css` 现有的单一 900px 断点，替换为命名区域 + 三档断点。完成后：桌面三栏不变；平板两栏（目录 + 正文，右侧信息落到正文下方）；手机单列（目录暂时堆在正文上方，下一任务接入抽屉）。

**Files:**
- Modify: `site/src/styles/tokens.css:20-35`

- [ ] **Step 1: 替换 `.layout` 区块到 `@media (max-width: 900px)` 整段**

把 `tokens.css` 中从 `.layout {`（第 20 行）到 `@media (max-width: 900px) { ... }` 闭合花括号（第 35 行）这一整段，替换为：

```css
.layout { display: grid;
  grid-template-columns: 260px minmax(0, var(--max-read)) 280px;
  grid-template-areas: "nav main aside";
  gap: 2rem; max-width: 1320px; margin: 0 auto; padding: 1.5rem; align-items: start; }
/* 无右栏时去掉空列,正文在左栏右侧的空间内居中,避免内容偏左、右侧留白。 */
.layout.no-aside { grid-template-columns: 260px minmax(0, 1fr);
  grid-template-areas: "nav main"; }
.layout.no-aside .reading { max-width: var(--max-read); margin-inline: auto; }
.col-left  { grid-area: nav; }
.reading   { grid-area: main; min-width: 0; }
.col-right { grid-area: aside; }
.reading h1, .reading h2 { color: var(--green); }
.panel { background: var(--panel); border: 1px solid #e7e1d4; border-radius: 8px; padding: 1rem; }
/* 两侧栏滚动时固定:粘在视口顶部,内容超长则各自内部滚动,中间正文照常推动整页。 */
.col-left, .col-right { position: sticky; top: 1.5rem;
  max-height: calc(100vh - 3rem); overflow-y: auto; }

/* 平板:两栏(目录 + 正文),右侧辅助信息落到正文下方。 */
@media (min-width: 768px) and (max-width: 1199px) {
  .layout { grid-template-columns: 220px minmax(0, var(--max-read));
    grid-template-areas: "nav main" "nav aside";
    gap: 1.5rem; padding: 1.25rem; }
  .layout.no-aside { grid-template-columns: 220px minmax(0, 1fr);
    grid-template-areas: "nav main"; }
  .col-right { position: static; max-height: none; overflow: visible; margin-top: 1.5rem; }
}

/* 手机:单列。抽屉式目录在 Task 2 接入。 */
@media (max-width: 767px) {
  .layout { display: block; padding: 0; }
  .reading { padding: 1rem; margin: 0 auto; }
  .col-left, .col-right { position: static; max-height: none; overflow: visible; }
  .col-right { padding: 0 1rem 1.5rem; }
}
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功，无报错（`validate-content` + `astro build` + pagefind 全过）。

- [ ] **Step 3: 目测验证**

Run: `npm run dev`，浏览器开 `http://localhost:4321/`，并打开任一解读文章页（有右栏的页型）。
- 桌面（≥1200px）：三栏，与改动前一致。
- 平板（拖到 ~900px）：两栏，左侧目录在，文章页右侧的关键词/关联/引用出现在正文下方。
- 手机（拖到 ~375px）：单列，目录（暂时）堆在正文上方，正文无横向滚动。

- [ ] **Step 4: 提交**

```bash
git add site/src/styles/tokens.css
git commit -m "feat(site): grid named-areas + tablet/phone breakpoints"
```

---

### Task 2: 手机端固定顶栏 + 左侧抽屉目录

在 `BaseLayout.astro` 加顶栏与遮罩标签、给目录 `aside` 加 `id`、加一段切换脚本；在 `tokens.css` 加顶栏/遮罩基样式，并把手机断点里的目录改成抽屉。完成后：手机端目录由 ☰ 唤出、遮罩/Esc/点链接关闭，正文全宽干净。

**Files:**
- Modify: `site/src/layouts/BaseLayout.astro:43-49`
- Modify: `site/src/styles/tokens.css`（Task 1 写入的 `@media (max-width: 767px)` 区块 + 新增顶栏/遮罩基样式）

- [ ] **Step 1: 替换 `BaseLayout.astro` 的 `<body>` 内容**

把 `BaseLayout.astro` 中现有的 `<body> ... </body>`（第 43–49 行）替换为：

```astro
  <body>
    <header class="topbar">
      <button id="nav-toggle" class="topbar-burger" type="button"
              aria-label="打开目录" aria-controls="site-nav" aria-expanded="false">☰</button>
      <a class="topbar-title" href="/">巴菲特知识库</a>
      <a class="topbar-search" href="/search" aria-label="搜索">🔍</a>
    </header>
    <div id="nav-backdrop" class="nav-backdrop"></div>
    <div class:list={['layout', { 'no-aside': !hasAside }]}>
      <aside id="site-nav" class="col-left"><Sidebar /></aside>
      <main class="reading"><slot /></main>
      {hasAside && <aside class="col-right"><slot name="aside" /></aside>}
    </div>
    <script>
      const body = document.body;
      const toggle = document.getElementById('nav-toggle');
      const backdrop = document.getElementById('nav-backdrop');
      const nav = document.getElementById('site-nav');
      if (toggle && backdrop && nav) {
        const open = () => {
          body.classList.add('nav-open');
          toggle.setAttribute('aria-expanded', 'true');
          nav.querySelector<HTMLElement>('a, input, button')?.focus();
        };
        const close = () => {
          body.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        };
        toggle.addEventListener('click', () =>
          body.classList.contains('nav-open') ? close() : open());
        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && body.classList.contains('nav-open')) close();
        });
        // 视口回到 ≥768px(例如旋转屏幕)时清除残留的打开态。
        window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
          if (e.matches) close();
        });
      }
    </script>
  </body>
```

- [ ] **Step 2: 在 `tokens.css` 加顶栏/遮罩基样式**

在 `tokens.css` 的 `.panel { ... }` 规则之后、`.col-left, .col-right { position: sticky ... }` 之前，插入：

```css
/* 移动顶栏与遮罩:默认隐藏,仅手机档(max-width:767px)显示。 */
.topbar { display: none; align-items: center; gap: 0.75rem;
  position: sticky; top: 0; z-index: 30;
  padding: 0.6rem 1rem; background: var(--panel); border-bottom: 1px solid #e7e1d4; }
.topbar-burger { background: none; border: 0; font-size: 1.4rem; line-height: 1;
  color: var(--text); cursor: pointer; padding: 0.2rem 0.4rem; }
.topbar-title { font-weight: 700; color: var(--text); flex: 1; }
.topbar-title:hover { text-decoration: none; }
.topbar-search { font-size: 1.2rem; text-decoration: none; }
.nav-backdrop { display: none; }
```

- [ ] **Step 3: 把手机断点的目录改成抽屉**

把 Task 1 写入的 `@media (max-width: 767px) { ... }` 整段替换为：

```css
/* 手机:单列 + 抽屉式目录。 */
@media (max-width: 767px) {
  .layout { display: block; padding: 0; }
  .reading { padding: 1rem; margin: 0 auto; }
  .col-right { position: static; max-height: none; overflow: visible; padding: 0 1rem 1.5rem; }

  /* 顶部固定栏仅手机出现 */
  .topbar { display: flex; }

  /* 目录变左侧抽屉 */
  .col-left {
    position: fixed; inset: 0 auto 0 0; z-index: 50;
    width: min(82vw, 320px); height: 100vh; height: 100dvh; max-height: none;
    overflow-y: auto; background: var(--paper); padding: 1rem;
    transform: translateX(-100%); transition: transform 0.22s ease;
    box-shadow: 2px 0 16px rgba(20, 24, 21, 0.18);
  }
  body.nav-open .col-left { transform: translateX(0); }
  body.nav-open { overflow: hidden; } /* 抽屉打开时锁背景滚动 */

  /* 遮罩 */
  .nav-backdrop {
    display: block; position: fixed; inset: 0; z-index: 40;
    background: rgba(20, 24, 21, 0.45);
    opacity: 0; visibility: hidden; transition: opacity 0.22s ease, visibility 0.22s ease;
  }
  body.nav-open .nav-backdrop { opacity: 1; visibility: visible; }
}
```

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 构建成功，无报错。

- [ ] **Step 5: 目测验证（手机视口 ~375px）**

Run: `npm run dev`，浏览器开发者工具切到 375px 宽。
- 顶栏显示：☰ · 巴菲特知识库 · 🔍。
- 点 ☰：目录从左滑入，背景变暗。
- 点遮罩 / 按 Esc：目录滑出关闭。
- 点目录里任一链接：跳转后新页面目录默认关闭。
- 桌面（≥768px）：顶栏与遮罩不显示，目录恢复为侧栏。

- [ ] **Step 6: 提交**

```bash
git add site/src/layouts/BaseLayout.astro site/src/styles/tokens.css
git commit -m "feat(site): phone top bar + off-canvas drawer nav"
```

---

### Task 3: 小屏宽内容防溢出

防止图片、表格、代码块、图谱在小屏撑破布局。

**Files:**
- Modify: `site/src/styles/tokens.css`

- [ ] **Step 1: 在 `tokens.css` 加正文宽内容收口规则**

在 `.reading h1, .reading h2 { color: var(--green); }` 这一行之后插入：

```css
/* 小屏防溢出:正文内图片/表格/代码块不超过容器,宽表格与代码横向滚动。 */
.reading img, .reading video, .reading pre, .reading table { max-width: 100%; }
.reading pre { overflow-x: auto; }
.reading table { display: block; overflow-x: auto; }
```

- [ ] **Step 2: 在 `tokens.css` 末尾加图谱高度收口**

在文件末尾追加：

```css
/* 图谱容器在手机上略降高度,避免占满竖屏。 */
@media (max-width: 767px) { #graph { height: 70vh; } }
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功，无报错。

- [ ] **Step 4: 目测验证**

Run: `npm run dev`，375px 宽下打开一篇含表格/图片的原文页，以及图谱页（`/graph`）。
- 表格/图片不超出屏幕宽，宽表格可横向滑动。
- 图谱不溢出，竖屏高度合适。

- [ ] **Step 5: 提交**

```bash
git add site/src/styles/tokens.css
git commit -m "feat(site): guard wide content (tables/img/pre/graph) on small screens"
```

---

### Task 4: 触控目标尺寸

把抽屉内目录链接、文章页视图切换按钮做成适合手指点按的尺寸。

**Files:**
- Modify: `site/src/components/Sidebar.astro`（`<style>` 区块末尾）
- Modify: `site/src/layouts/ArticleLayout.astro`（新增 `<style>` 区块）

- [ ] **Step 1: Sidebar 手机端加大点按区域**

在 `Sidebar.astro` 的 `<style>` 区块内，最后一条规则 `.sub a.active { ... }` 之后插入：

```css
  /* 手机抽屉内:加大目录项点按区域。 */
  @media (max-width: 767px) {
    .cat-menu summary { padding: 0.5rem 0; }
    .sub a { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  }
```

- [ ] **Step 2: ArticleLayout 给视图切换按钮可点尺寸**

在 `ArticleLayout.astro` 文件最末尾（最后的 `</script>` 之后）追加一个 `<style>` 区块：

```astro
<style>
  /* 视图切换:可点按尺寸 + 小屏换行。 */
  .views { flex-wrap: wrap; }
  .view-btn {
    font: inherit; cursor: pointer; color: var(--green);
    background: var(--panel); border: 1px solid #e7e1d4; border-radius: 6px;
    padding: 0.5rem 0.9rem; min-height: 2.5rem;
  }
  .view-btn:hover { background: var(--green-soft); }
</style>
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功，无报错。

- [ ] **Step 4: 目测验证**

Run: `npm run dev`，375px 宽下打开抽屉，目录项更高、更易点；打开一篇解读文章，「阅读/图谱/来源」按钮有边框、够大、必要时换行。

- [ ] **Step 5: 提交**

```bash
git add site/src/components/Sidebar.astro site/src/layouts/ArticleLayout.astro
git commit -m "feat(site): touch-friendly drawer links and view-toggle buttons"
```

---

### Task 5: 首页卡片栅格断点对齐

让首页卡片在窄屏更早转单列，与新断点协调。

**Files:**
- Modify: `site/src/pages/index.astro:215-217`

- [ ] **Step 1: 调整首页卡片断点**

把 `index.astro` 中：

```css
  @media (max-width: 560px) {
    .cat-grid { grid-template-columns: 1fr; }
  }
```

改为：

```css
  @media (max-width: 640px) {
    .cat-grid { grid-template-columns: 1fr; }
  }
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功，无报错。

- [ ] **Step 3: 目测验证**

Run: `npm run dev`，首页在 ~600px 宽时卡片为单列、不再挤成两列窄卡。

- [ ] **Step 4: 提交**

```bash
git add site/src/pages/index.astro
git commit -m "feat(site): home card grid switches to single column earlier"
```

---

### Task 6: 全站跨视口验证

跨页型、跨视口最终核对，确认无回归。

**Files:** 无（仅验证）

- [ ] **Step 1: 全量构建 + 现有单测**

Run: `npm run build && npm test`
Expected: 构建成功；vitest 全绿（`lib` 逻辑未受影响）。

- [ ] **Step 2: 跨视口、跨页型目测**

Run: `npm run dev`，在 375 / 768 / 1024 / 1280px 四档下，分别核对：
- 首页（`/`）
- 解读文章页（有右栏 + 视图切换 + 图谱）
- 原文页（有原文信息/同类原文）
- 检索页（`/search`）
- 图谱页（`/graph`）

每页核对清单：
- 375px：顶栏 + 抽屉可开合；正文全宽无横向滚动；右侧信息在正文下方。
- 768 / 1024px：两栏，目录常驻，右侧信息在正文下方。
- 1280px：三栏，与改动前一致。

- [ ] **Step 3: 如有问题回到对应任务修复；无问题则收尾**

无新提交（前序任务已分别提交）。如发现需修复，定位到对应任务的文件改正并补一次提交。

---

## Self-Review

**Spec coverage：**
- §3 三档断点 → Task 1。
- §4 命名区域机制 + 平板两栏 → Task 1。
- §4.2 / §5 手机抽屉 + 顶栏 + 脚本 → Task 2。
- §6.1/6.2 宽内容收口 + 表格滚动 → Task 3。
- §6.4 图谱小屏 → Task 3。
- §6.3 触控目标（目录链接 + 视图按钮）→ Task 4。
- 首页卡片断点对齐（§1 提及）→ Task 5。
- §8 验证 → 每任务的构建/目测 + Task 6 全量。
- §6.2 提到的 SourceMatrix：经查其 `<pre>` 已用 `white-space:pre-wrap` 自动换行，且被 Task 3 的 `.reading pre/table` 全局规则覆盖，无需单独改动（YAGNI）。

**Placeholder scan：** 无 TBD/TODO；每个代码步骤均为可直接落地的完整代码。

**Type/选择器一致性：** `body.nav-open`、`#nav-toggle`、`#nav-backdrop`、`#site-nav`、`.topbar`、`.nav-backdrop`、`.col-left/.reading/.col-right`、`grid-area: nav/main/aside` 在脚本、标签、CSS 间一致。脚本中 `open()/close()` 命名一致。
