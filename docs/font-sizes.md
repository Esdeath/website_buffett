# 全站字体大小清单

本站未将字号定义为 CSS 变量(`site/src/styles/tokens.css` 仅含颜色与布局 token),
字号分散写在各组件 / 页面的 `<style>` 中。下表 rem→px 按默认根字号 16px 换算。

## 全站基础

| 位置 | 选择器 | 字号 | ≈px |
|---|---|---|---|
| `tokens.css:13` | `html, body` | 未显式设置 → 浏览器默认 | **16px** |
| `tokens.css:14` | `body` 行高 | `line-height: 1.75` | — |
| `tokens.css:14` | 字体族 | `"Noto Serif SC", "Songti SC", Georgia, serif` | — |

## 正文文章内容(`.reading` 内 h1–h6 / p)

未显式设置 font-size,走浏览器 UA 默认值(相对 16px):

| 元素 | 默认值 | ≈px |
|---|---|---|
| `h1` | 2em | 32px |
| `h2` | 1.5em | 24px |
| `h3` | 1.17em | ~18.7px |
| `h4` / `p` | 1em | 16px |
| `h5` | 0.83em | ~13.3px |
| `h6` | 0.67em | ~10.7px |

## 首页 `src/pages/index.astro`

| 行 | 选择器 / 用途 | 字号 | ≈px |
|---|---|---|---|
| 132 | hero 大标题 | `clamp(2.1rem, 7vw, 3.2rem)` | 33.6 → 51.2px |
| 140 | 副标题 / lead | `clamp(1.05rem, 2.6vw, 1.35rem)` | 16.8 → 21.6px |
| 157 | `.ac-title` | `1.05rem` | 16.8px |
| 159 | 卡片描述 | `0.82rem` | 13.1px |
| 162 | `.ac-arrow` 箭头 | `1.4rem` | 22.4px |
| 167 | 栏目小标题 | `0.8rem` | 12.8px |
| 170 | `.col-block .lead` | `0.95rem` | 15.2px |
| 189 | 分类区块标题 | `1.4rem` | 22.4px |
| 193 | `.cat-name` | `1.05rem` | 16.8px |
| 195 | 分类计数 | `0.82rem` | 13.1px |
| 199 | 分类描述 | `0.88rem` | 14.1px |
| 209 | 页脚 | `0.8rem` | 12.8px |

## 侧边栏 `src/components/Sidebar.astro`

| 行 | 用途 | 字号 | ≈px |
|---|---|---|---|
| 18 | 提示语 | `0.85rem` | 13.6px |
| 110 | 分组小标题 | `0.78rem` | 12.5px |
| 130 | 导航链接 | `0.9rem` | 14.4px |

## 移动端顶栏 `src/styles/tokens.css`

| 行 | 选择器 | 字号 | ≈px |
|---|---|---|---|
| 41 | `.topbar-burger` 汉堡 | `1.4rem` | 22.4px |
| 45 | `.topbar-search` 搜索图标 | `1.2rem` | 19.2px |

## 其他

| 位置 | 用途 | 字号 |
|---|---|---|
| `src/components/SourceMatrix.astro:10` | 来源矩阵 `<pre>` | `0.85rem`(13.6px) |
| `src/components/graph-client.ts:25` | 图谱节点标签 | `8`(Cytoscape 单位,8px) |
| `src/pages/og/[...route].ts:52` | OG 图标题 | `60`(px,1200×630 画布) |
| `src/pages/og/[...route].ts:59` | OG 图描述 | `30`(px) |

## 去重后的字号集合(rem 体系)

`0.78 · 0.8 · 0.82 · 0.85 · 0.88 · 0.9 · 0.95 · 1.05 · 1.2 · 1.35 · 1.4 · 2.1 · 3.2` rem

两个 `clamp()`:

- `clamp(2.1rem, 7vw, 3.2rem)`
- `clamp(1.05rem, 2.6vw, 1.35rem)`
