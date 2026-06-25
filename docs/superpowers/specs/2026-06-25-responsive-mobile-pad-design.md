# 巴菲特知识库 移动端 / 平板端 响应式适配设计稿

日期：2026-06-25
方向：在不改动视觉风格与信息架构的前提下，让站点在手机、平板上布局合理、可读、可导航。
目标：手机端用「汉堡 + 抽屉」收纳目录，平板端保留左侧目录栏，正文始终是干净的阅读主线。

## 1. 背景

当前站点是 Astro 静态站，桌面端为三栏布局：

- 左栏 `.col-left`（260px）：站点目录导航（4 个原文分组 + 14 个解读分类，数百条二级链接），`<Sidebar />`。
- 中栏 `.reading`（`minmax(0, 720px)`）：正文。
- 右栏 `.col-right`（280px）：文章页的关键词/关联/引用，原文页的原文信息/同类原文；仅在有 `aside` slot 的页面出现。

布局与断点集中在 `site/src/styles/tokens.css` 的 `.layout` 网格里。目前只有一个断点：

```css
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .col-left, .col-right { position: static; max-height: none; overflow: visible; }
  .col-right { order: 3; }
}
```

**核心问题**：900px 以下直接塌成单列，整条左侧目录（数百条链接）会堆在正文**上方**，把文章推到很远的下面，手机上几乎无法使用。这是本次要解决的主要问题。

首页 `index.astro` 已有自己的卡片栅格断点（560px 两列转单列），属于局部响应式，本次与新断点对齐即可。

## 2. 设计目标

### 2.1 核心目标

让站点在手机和平板上布局符合响应式规范，正文始终是清晰的阅读主线，目录在需要时一触可达、不需要时不挡路。

### 2.2 具体目标

- 手机端：目录收进左侧抽屉，由顶部固定栏的 ☰ 唤出；正文全宽、干净。
- 平板端：保留左侧目录作为常驻栏（2 栏），右侧辅助信息移到正文下方。
- 宽内容（表格、图片、来源矩阵、图谱）在小屏不撑破布局。
- 触控目标尺寸适合手指点按。

### 2.3 不做的事

- 不改视觉风格、配色、字体、排版基调。
- 不改信息架构，不动导航内容与页面结构。
- 不引入前端框架或客户端路由（保持 Astro 静态多页）。
- 不做花哨动效；抽屉只用一次轻量滑入 + 遮罩。

## 3. 断点方案

用三档替换现有单一的 900px 断点。中间正文宽度（`--max-read: 720px`）保持不变。

| 档位 | 视口宽度 | 布局 |
|------|----------|------|
| 桌面 Desktop | `≥ 1200px` | 三栏：`nav 260 · reading 720 · aside 280`（与现状一致，不变） |
| 平板 Pad | `768px – 1199px` | 两栏：`nav 220 · reading`；右侧辅助信息移到正文下方 |
| 手机 Phone | `< 768px` | 单列；顶部固定栏 + 左侧抽屉目录；辅助信息在正文下方 |

断点取值说明：

- `768px` 是经典平板/手机分界。iPad 竖屏（768）落入平板档，保留侧栏——与「平板保留目录」的决定一致。
- `1200px` 作为三栏门槛：低于它时三栏会把正文挤到 ~370–520px 过窄，故 iPad 横屏（1024）与小尺寸笔记本（1024–1199）统一走更舒展的两栏，桌面（≥1200）才用三栏。

## 4. 布局机制：CSS Grid 命名区域

为了在不移动 DOM 的前提下，让右栏在平板/手机「跑到正文下方」，给 `.layout` 加 `grid-template-areas`，三个子元素各自占一个区域，按断点重排区域。DOM 顺序保持 `col-left → reading → col-right` 不变。

```css
.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, var(--max-read)) 280px;
  grid-template-areas: "nav main aside";
  gap: 2rem; max-width: 1320px; margin: 0 auto; padding: 1.5rem; align-items: start;
}
.layout.no-aside {
  grid-template-columns: 260px minmax(0, 1fr);
  grid-template-areas: "nav main";
}
.col-left  { grid-area: nav; }
.reading   { grid-area: main; }
.col-right { grid-area: aside; }
```

桌面端（`≥ 1200px`）即上面的默认值，等价于现状。

### 4.1 平板档 `768px – 1199px`

```css
@media (min-width: 768px) and (max-width: 1199px) {
  .layout {
    grid-template-columns: 220px minmax(0, var(--max-read));
    grid-template-areas: "nav main"
                         "nav aside";
    gap: 1.5rem; padding: 1.25rem;
  }
  /* 右栏改为正文下方的全宽块（≤ 阅读宽度），取消粘顶 */
  .col-right { position: static; max-height: none; overflow: visible; margin-top: 1.5rem; }
  /* 左侧目录仍粘顶、可内部滚动（保持现状行为） */
}
```

`nav` 跨两行占满左列；`main`、`aside` 在右列上下排布，`aside` 自然落到正文下方且不超过阅读宽度。`.no-aside` 页面（首页、检索、图谱、分类/关键词列表）在本档为 `nav main` 两栏，正文照常居中。

### 4.2 手机档 `< 768px`

```css
@media (max-width: 767px) {
  .layout { display: block; padding: 0; }
  .reading { padding: 1rem; margin: 0 auto; max-width: var(--max-read); }
  .col-right { position: static; max-height: none; overflow: visible;
               padding: 0 1rem 1.5rem; }

  /* 目录变抽屉：默认移出屏幕左侧 */
  .col-left {
    position: fixed; inset: 0 auto 0 0; z-index: 50;
    width: min(82vw, 320px); height: 100dvh; overflow-y: auto;
    background: var(--paper); padding: 1rem;
    transform: translateX(-100%); transition: transform 0.22s ease;
    box-shadow: 2px 0 16px rgba(20, 24, 21, 0.18);
  }
  body.nav-open .col-left { transform: translateX(0); }
  body.nav-open { overflow: hidden; } /* 抽屉打开时锁定背景滚动 */

  .nav-backdrop {
    position: fixed; inset: 0; z-index: 40; background: rgba(20, 24, 21, 0.45);
    opacity: 0; visibility: hidden; transition: opacity 0.22s ease;
  }
  body.nav-open .nav-backdrop { opacity: 1; visibility: visible; }

  .topbar { display: flex; } /* 顶部固定栏仅手机出现 */
}
```

`100dvh` 用动态视口高度以适配移动浏览器地址栏；对不支持 `dvh` 的旧浏览器，前面再写一行 `height: 100vh;` 作回退。遮罩由独立的 `.nav-backdrop` 元素承担（见 §5），便于点击关闭；抽屉自身只用一条投影 `box-shadow` 与背景区分。

## 5. 顶部栏与抽屉（`BaseLayout.astro`）

在 `<body>` 内、`.layout` 之前加入顶部栏与遮罩；两者默认隐藏，仅手机档 `display` 出来。

```html
<header class="topbar">
  <button class="topbar-burger" aria-label="打开目录" aria-controls="site-nav" aria-expanded="false">☰</button>
  <a class="topbar-title" href="/">巴菲特知识库</a>
  <a class="topbar-search" href="/search" aria-label="搜索">🔍</a>
</header>
<div class="nav-backdrop" hidden></div>
```

- `.col-left`（即 `<aside class="col-left">`）加 `id="site-nav"`，作为抽屉本体被 `aria-controls` 指向。抽屉内已含 `<Sidebar />` 自带的搜索框与完整目录，无需重复。
- `.topbar` 默认 `display: none`，仅在 `< 768px` 显示为 `flex`：左 ☰、中站名、右 🔍；`position: sticky; top: 0; z-index: 30;`，浅色背景 + 底部细线，与站点风格一致。
- 平板/桌面档 `.topbar`、`.nav-backdrop` 均不显示，`.col-left` 维持栏目形态，互不影响。

### 5.1 交互脚本（内联于 BaseLayout）

最小化的开合逻辑：

- 点 ☰ → `body.classList.add('nav-open')`，按钮 `aria-expanded="true"`，焦点移入抽屉。
- 点遮罩 / 抽屉内 ✕（可选）/ 按 `Esc` → 移除 `nav-open`，`aria-expanded="false"`，焦点还给 ☰。
- 点抽屉内任一链接：这是整页跳转（Astro 静态多页），新页面默认抽屉是关的，无需额外处理。
- `body.nav-open` 时背景 `overflow: hidden` 锁滚动。

脚本只操作一个 `body` class 与 `aria-expanded`，不依赖框架。可加一段「视口 ≥768px 时自动清除 `nav-open`」的保护，避免旋转屏幕后状态残留。

## 6. 小屏防溢出与触控细节

这些是移动端必须的防御性调整，范围限定在不改视觉基调：

1. **宽内容收口**（全局，`tokens.css`）：
   ```css
   .reading img, .reading table, .reading pre { max-width: 100%; }
   .reading pre { overflow-x: auto; }
   ```
2. **宽表格横向滚动**：`SourceMatrix`（来源矩阵）及原文中的宽表格，包裹层或表格自身加 `display: block; overflow-x: auto;`，小屏可横滑而不撑破布局。
3. **触控目标**：抽屉内 `.sub a` 的纵向 padding 适当加大（现 `0.3rem`），更易点按；文章页 `阅读 / 图谱 / 来源` 切换按钮（`.view-btn`）给可点尺寸、允许换行（现为无样式 `<button>`）。
4. **图谱**：`GraphView` 容器 `height: 75vh`，小屏限定 `max-width: 100%` 并确认不产生横向溢出；必要时手机档降为 `70vh`。
5. **整页防横向溢出**：核对无固定宽元素超出视口；如确有需要，谨慎使用 `html, body { overflow-x: hidden; }`。

## 7. 受影响文件

- `site/src/styles/tokens.css`：`.layout` 命名区域 + 三档断点；`.reading` 宽内容收口；`.topbar` / `.nav-backdrop` / 抽屉态样式。
- `site/src/layouts/BaseLayout.astro`：新增顶部栏 + 遮罩标签；`.col-left` 加 `id`；内联开合脚本。
- `site/src/components/Sidebar.astro`：抽屉内触控目标 padding（小幅）。
- `site/src/components/SourceMatrix.astro`：宽表格横向滚动包裹。
- `site/src/layouts/ArticleLayout.astro`：`.view-btn` 触控尺寸与换行。
- `site/src/components/GraphView.astro`：小屏宽度约束。
- `site/src/pages/index.astro`：首页卡片栅格断点与新断点对齐（小幅）。

## 8. 验证方式

CSS 响应式改动无法用现有 vitest 单测覆盖（单测针对 `lib` 逻辑），采用：

1. `npm run build`（含 `validate-content` + `astro build` + pagefind）通过，不破坏构建。
2. `npm run dev` 起本地服务，在代表性宽度逐档目测：
   - `375px`（iPhone）：顶栏 + ☰ 唤出抽屉 + 遮罩关闭 + 正文全宽、无横向滚动。
   - `768px`（iPad 竖屏）：两栏，左侧目录常驻，右侧信息在正文下方。
   - `1024px`（iPad 横屏 / 小笔记本）：两栏。
   - `1280px`（桌面）：三栏，与现状一致。
3. 重点页型各看一页：首页、解读文章页（有右栏 + 视图切换 + 图谱）、原文页（有原文信息/同类原文）、检索页、图谱页。

## 9. 风险与权衡

- **桌面三栏门槛从 900 升到 1200**：1024–1199 的用户从三栏变两栏。这是有意的改善（避免正文过窄），但属于桌面侧的可见变化，需在验证时确认观感可接受。
- **抽屉可访问性**：实现包含 `aria-expanded`、`Esc` 关闭、焦点进出；完整焦点陷阱（focus trap）从简，先保证键盘可关闭与读屏可感知，后续可加强。
- **`dvh` 兼容**：以 `vh` 作回退，旧浏览器抽屉高度退化为静态视口高度，不影响功能。
