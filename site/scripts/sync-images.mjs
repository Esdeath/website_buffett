import { fileURLToPath } from 'node:url';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';

// 原文素材的配图散落在 buffett/<分组>/images/ 下,而 Astro 只会把 site/public/ 里的
// 静态文件按站点根目录对外提供。正文 Markdown 用 ![](/images/image_X.png) 引用,
// 因此构建/开发前先把各分组的 images/ 汇总复制进 site/public/images/(扁平命名)。
// 该目录由本脚本生成、已在 .gitignore 忽略,buffett/ 下的原图才是唯一真相来源。

const root = fileURLToPath(new URL('../../', import.meta.url));
const dest = fileURLToPath(new URL('../public/images/', import.meta.url));

// buffett/ 下哪些分组可能带 images/ 子目录(与 sources collection、校验脚本对齐)。
const SOURCE_DIRS = ['berkshire', 'interview', 'shareholders'];

// 从干净的目标目录开始,避免删源后留下孤儿文件。
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

let copied = 0;
const seen = new Map(); // 文件名 -> 来源分组,用于侦测扁平命名冲突

for (const dir of SOURCE_DIRS) {
  const srcDir = `${root}buffett/${dir}/images`;
  if (!existsSync(srcDir)) continue;
  for (const name of readdirSync(srcDir)) {
    if (name.startsWith('.')) continue; // 跳过 .DS_Store 等
    if (seen.has(name)) {
      console.error(
        `✗ 图片命名冲突: ${name} 同时出现在 ${seen.get(name)} 与 ${dir}`,
      );
      process.exit(1);
    }
    seen.set(name, dir);
    cpSync(`${srcDir}/${name}`, `${dest}${name}`);
    copied += 1;
  }
}

console.log(`✓ 同步图片完成: ${copied} 张 → site/public/images/`);
