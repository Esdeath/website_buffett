import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://buffett-kb.pages.dev', // 部署后改为实际域名
  markdown: {
    // remarkWikilink 在 Task 4 接入
    remarkPlugins: [],
  },
});
