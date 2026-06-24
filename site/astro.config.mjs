import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRegistry, buildLookup } from "./src/lib/registry.ts";
import { pathToUrl } from "./src/lib/url.ts";
import { remarkWikilink } from "./src/lib/remark-wikilink.mjs";

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

export default defineConfig({
  site: "https://website-buffett.pages.dev", // 部署后改为实际域名
  markdown: {
    remarkPlugins: [[remarkWikilink, { lookup }]],
  },
});
