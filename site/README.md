# 巴菲特知识库网站

Astro 静态站，读取 `../buffett/articles` 与 `../docs/keyword-registry.md`。

## 本地
- `npm install`
- `npm run dev` — 开发
- `npm run build` — 校验 + 构建 + 生成搜索索引到 `dist/`
- `npm run preview` — 预览 `dist/`

## 原文主题全编

阅读入口：`/books/buffett-yuanwen/`。重编版分为 7 篇正文与附录，共 23 章正文、92 个正文主题及 6 个附录主题。阅读顺序为投资立场 → 企业判断 → 投资行动 → 行业案例 → 经营资本 → 市场环境 → 人生。每章先连续阅读各节核心原文，再在章末查阅同题延伸材料；延伸材料按年份与原文次序排列。原有 300 问精选仍在 `/books/buffett-wenda-lu/`。

- `npm run build:source-book` — 从 `buffett/{berkshire,interview,shareholders}` 生成 `buffett/books/buffett-yuanwen.md` 与逐段覆盖清单。
- `npm run check:source-book` — 校验书稿最新、每段逐字一致、全部来源正文无遗漏且只编排一次；已接入正式构建。
- `npm run build:source-book -- --review` — 另生成 `output/source-book-review.json`，用于标题、归属与段落起点复核。
- `npm run export:source-book` — 导出完整的 HTML、PDF 和 EPUB 至仓库根目录 `output/{html,pdf,epub}/buffett-yuanwen.*`。HTML 为图片内嵌的单文件，章末延伸材料可展开且支持锚点定位；EPUB 按篇、章、核心小节与延伸小节分文件，包含三级目录；PDF 嵌入中文字体，包含目录、书签、跳转链接及页码。可通过 `-- --format=html,epub` 选择格式，或用 `-- --offline` 复用图片缓存而不重试下载。

导出器复用原文主题全编的数据与正文渲染，保留所有 4,064 则材料。排版模型及图片缓存在 `tmp/pdfs/buffett-yuanwen/`。优先使用 Codex bundled Python，也可用 `SOURCE_BOOK_PYTHON` 指定包含 `reportlab`、`lxml`、`pypdf` 的 Python；PDF 默认使用 macOS 宋体。原库缺失且无法从公开站点取得的图片，会在原位置显示明确的编者注和文件名，并在全书编排说明中列出数量，不用其他图片替代。

编排数据在 `buffett/books/buffett-yuanwen/`：`outline.json` 定义主题递进及初分词表，`boundaries.json` 用唯一原文起点划分无标题长访谈，`placements-*.json` 保存初版人工复核的主题归属。`editing.json` 保存重编版核心选录顺序、概念/机制/案例/边界标签、人工移位及其理由、重复版本对照；其中 `previousSections` 固定初版归属，防止调整目录顺序导致分类分值相同时的意外移位。当前包含 213 则核心原文、3,481 则延伸材料及 370 则附录材料。资料说明、历年业绩表与重复版本完整保留在附录；混合实质讨论的原文不因含寒暄或表格而删节。修改分节规则或原文后须重新检查受影响条目，编号依原文中的分段次序生成，不能假定编号相同就仍是同一段。开发服务器缓存书籍数据，修改这些编排文件后重启开发服务器。

正文来自连续原文切片，不使用 300 问精选的删节正文。Markdown 内的“原文开始/结束”标记及 `coverage.json` 记录位置和 SHA-256，可逐字还原来源正文。来源已有的省略、译注、不同作者的署名、现场流程等全部照录；书稿未新增删节。前言和附录也计入覆盖。网页仅转换排版、解析链接和映射图片显示地址；下载稿保留原始 Markdown 图片路径，配图源文件仍在原文的 `images/` 目录。

## 精编问答

《巴菲特与芒格投资问答》是经用户授权删改的阅读版：归并同题内容、删除寒暄与赘述、整理自然段，保留论证、必要案例和适用条件。正文不出现出处标注；按章节与问题对应的全部来源集中在书末。此版明确标为编辑提炼，不声称逐字实录。

- `buffett/books/buffett-jingbian/chapters/` 保存人工精编的 23 章，每问保留内部 `sourceIds` 与主题映射，支持逐条追溯。
- `npm run build:edited-book` 生成书稿、排版模型及 `provenance.json`，校验原文引用、主题覆盖、重复问题及正文标注。
- `npm run check:edited-book` 检查以上生成文件是否最新。
- `npm run export:edited-book` 生成 `output/{html,pdf,epub}/buffett-jingbian.*`，并检查实际三种文件的问答文字、次序、目录与来源位置。
- `npm run export:edited-book -- --publish-current` 同时更新原阅读文件 `buffett-yuanwen.*`；首次更新前将完整原文全编另存为 `buffett-yuanwen-quanbian.*`，不会覆盖该备份。

本版导出仍使用上述 Python 依赖。HTML 保留原全编各正文小节的锚点别名，因此原有章节定位链接可继续打开相应主题。完整原文、逐字版编排与网站原文阅读入口分别保留。

## Cloudflare Pages 设置
- Connect 仓库
- **Root directory**: `site`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- Node 版本: 设环境变量 `NODE_VERSION=22`
- 部署后把 `astro.config.mjs` 的 `site` 改成实际域名
