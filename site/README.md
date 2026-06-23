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
