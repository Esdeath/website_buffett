# 侧边栏二级菜单设计

## 背景

当前侧边栏（`site/src/components/Sidebar.astro`）把分类渲染成一个扁平列表，每个分类名链接到分类页 `/categories/[slug]`。用户希望把它改成**二级菜单**：

- 一级是分类（如「核心哲学 · 16」）。
- 点击一级菜单**就地展开/收起**它的二级列表，不跳转。
- 二级是该分类下文章的「冒号前关键词」（如「安全边际」「保守主义」），横向流式排列，内容多了自动换行。
- 点击二级项**直接跳到该文章正文**。

## 范围

- **只改** `site/src/components/Sidebar.astro`（含其内联 `<style>`）。
- **不改**：`articles.ts`、分类页 `/categories/[slug]`、文章页、首页、搜索框、「查看知识图谱 →」。
- 所需数据由现有 `getCategories()` 提供：`{ name, slug, articles: Article[] }[]`，每篇 `Article` 含 `title` 和 `url`。

## 交互行为（已与用户确认）

- 点击一级菜单：**纯展开/收起**，不跳转分类页。
- 展开方式：**可同时展开多个**分类（非手风琴）。
- 默认状态：**全部收起**。

## 结构

用原生 `<details>` / `<summary>`，无需客户端 JS：

```
<details>                          ← 一级，每个分类一个，默认 collapsed
  <summary>核心哲学 · 16</summary>  ← 点击展开/收起，可多个同时开
  二级流式容器:
    <a>安全边际</a> <a>保守主义</a> <a>不懂不做</a> …   ← flex-wrap 横向，换行
</details>
```

## 关键逻辑

- **二级标签 = 冒号前内容**：`title.split(/[：:]/)[0]`，兼容中文「：」和英文「:」。
  - 标题无冒号时（如公司名「可口可乐」），`split` 返回原标题，整条原样显示。
- **二级链接**：`href = article.url`（已由 `getCategories()` 提供，keyword 类是 `/keywords/<slug>`，其它是 `/articles/<type>/<slug>`）。
- **悬停提示**：每个二级 `<a>` 加 `title={article.title}`（完整标题，含冒号后副标题）。
- **一级数量**：保留现有 `· {count}` 计数显示在 `<summary>` 里。

## 样式

- 沿用现有 token（`--green`、`--text-muted`、`--green-soft`）。
- 二级容器：`display:flex; flex-wrap:wrap; gap`，标签做成小号文字（必要时轻量 chip 背景），换行流式。
- `<summary>`：去掉/替换浏览器默认三角（`list-style:none` + 自定义指示符或纯文字），`cursor:pointer`，hover 有反馈。
- 移动端（现有 `@media max-width:900px` 单列布局）下行为不变，`<details>` 天然适配窄屏。

## 测试 / 验证

- 这是纯展示组件，无单元测试目标函数。验证靠 `npm run build`（含内容校验脚本）通过 + 本地 `astro dev` 目测：
  - 一级全部默认收起。
  - 点一级 → 展开二级，可同时展开多个。
  - 二级标签为冒号前关键词，超宽自动换行。
  - 点二级 → 进入对应文章正文页。
  - 无冒号标题整条原样显示、可点击。
