import { defineConfig } from "astro/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import { parseRegistry, buildLookup } from "./src/lib/registry.ts";
import { pathToUrl } from "./src/lib/url.ts";
import { createLastmodResolver } from "./scripts/sitemap-lastmod.mjs";
import { remarkWikilink } from "./src/lib/remark-wikilink.mjs";
import { remarkAutolink } from "./src/lib/remark-autolink.mjs";
import { remarkStripSourceTitle } from "./src/lib/remark-strip-source-title.mjs";
import { rehypeLetterTables } from "./src/lib/rehype-letter-tables.mjs";

const registryPath = fileURLToPath(
  new URL("../docs/keyword-registry.md", import.meta.url),
);
const entries = parseRegistry(readFileSync(registryPath, "utf8"));
const entryLookup = buildLookup(entries);

// 转成插件需要的 {url, keyword} 形态
const lookup = new Map();
for (const [term, e] of entryLookup) {
  lookup.set(term, { url: pathToUrl(e.path), keyword: e.keyword });
}

// 原文目录:仅这些文件启用「裸关键词自动链接」,解读文章(articles)沿用手写 [[ ]]。
const SOURCE_RE = /(?:^|[/\\])buffett[/\\](berkshire|interview|shareholders)[/\\]/;
const isSourceFile = (file) => SOURCE_RE.test(file?.path ?? "");

// sitemap <lastmod> 数据源。惰性初始化:serialize 只在 astro build 的
// astro:build:done 阶段被调用,所以 git 历史只在构建时读取一次,dev 不付代价。
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
let lastmodResolver = null;
function lastmodFor(url) {
  lastmodResolver ??= createLastmodResolver(REPO_ROOT);
  return lastmodResolver.lastmodFor(url);
}

// @astrojs/sitemap 会把 lastmod 规整成 ISO 时间戳(YYYY-MM-DDThh:mm:ss.sssZ)。
// 在 sitemap 写盘之后把它截回 YYYY-MM-DD;必须排在 sitemap() 之后以拿到已生成的文件。
function sitemapLastmodDates() {
  return {
    name: "sitemap-lastmod-date",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        for (const name of ["sitemap-0.xml", "sitemap-index.xml"]) {
          const file = join(outDir, name);
          if (!existsSync(file)) continue;
          const xml = readFileSync(file, "utf8");
          const patched = xml.replace(
            /<lastmod>(\d{4}-\d{2}-\d{2})T[0-9:.]+Z<\/lastmod>/g,
            "<lastmod>$1</lastmod>",
          );
          if (patched !== xml) writeFileSync(file, patched);
        }
        if (lastmodResolver) {
          const s = lastmodResolver.stats();
          const gitState = s.git
            ? `shallow=${s.shallow}, unshallow=${s.unshallow}, history=${s.completeHistory ? "full" : "partial"}`
            : "git 不可用";
          logger.info(
            `lastmod: ${gitState}, ${s.mapped} 内容页(文件最后提交)、${s.fallback} 聚合页(仓库最新提交)、${s.omitted} 省略`,
          );
        }
      },
    },
  };
}

export default defineConfig({
  site: "https://buffett.ayaseeri.com",
  integrations: [
    sitemap({
      // OG 图端点(/og/*.png)与搜索查询页不进站点地图;只收录可索引的内容页。
      filter: (page) =>
        !page.includes("/og/") &&
        !page.endsWith("/search/") &&
        !page.endsWith("/404/") &&
        !page.endsWith(".md"),
      // 每个 <url> 注入真实最后修改日期(见 scripts/sitemap-lastmod.mjs)。
      serialize: (item) => {
        const lastmod = lastmodFor(item.url);
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
    sitemapLastmodDates(),
  ],
  markdown: {
    remarkPlugins: [
      [remarkStripSourceTitle, { shouldRun: isSourceFile }],
      [remarkWikilink, { lookup }],
      [remarkAutolink, { lookup, shouldRun: isSourceFile }],
    ],
    rehypePlugins: [rehypeLetterTables],
  },
});
