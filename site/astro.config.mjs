import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRegistry, buildLookup } from "./src/lib/registry.ts";
import { pathToUrl } from "./src/lib/url.ts";
import { remarkWikilink } from "./src/lib/remark-wikilink.mjs";
import { remarkAutolink } from "./src/lib/remark-autolink.mjs";

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
const SOURCE_RE = /[/\\]buffett[/\\](berkshire|interview|shareholders)[/\\]/;
const isSourceFile = (file) => SOURCE_RE.test(file?.path ?? "");

export default defineConfig({
  site: "https://website-buffett.pages.dev", // 部署后改为实际域名
  markdown: {
    remarkPlugins: [
      [remarkWikilink, { lookup }],
      [remarkAutolink, { lookup, shouldRun: isSourceFile }],
    ],
  },
});
