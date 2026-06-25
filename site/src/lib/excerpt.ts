// 从 markdown 正文派生纯文本摘要,供无手写 description 的页面(解读文章)填 meta。
// 思路:先按行去掉块级噪声(frontmatter、标题、分割线、引用/列表标记),
// 再按内联规则去掉 wikilink / 链接 / 图片 / 强调 / 行内代码 / HTML,最后压空白、截断。

/** 去掉一个仅出现在开头的 frontmatter 块(--- ... ---)。collection.body 通常已不含,
 *  但直接传整篇 markdown 时也能正确处理。 */
function stripFrontmatter(md: string): string {
  return md.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/** 丢弃整行的块级元素:标题行、水平分割线。其余行保留文本。 */
function dropBlockLines(md: string): string {
  return md
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (/^#{1,6}\s/.test(t)) return false; // 标题
      if (/^([-*_])\1{2,}$/.test(t)) return false; // --- *** ___ 分割线
      return true;
    })
    .join('\n');
}

/** 内联清洗:wikilink/链接/图片/强调/行内代码/HTML/行首标记 → 纯文本。 */
function stripInline(text: string): string {
  return (
    text
      // 图片整体丢弃
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // [[target|label]] → label;[[target]] → target
      .replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2')
      // [label](url) → label
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // 行内代码 `x` → x
      .replace(/`([^`]+)`/g, '$1')
      // 粗体/斜体 **x** *x* __x__ _x_ → x
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      // HTML 标签
      .replace(/<[^>]+>/g, '')
      // 行首引用/列表/有序标记
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(/^[ \t]*([-*+]|\d+\.)[ \t]+/gm, '')
  );
}

/**
 * 把 markdown 正文转成单行纯文本摘要。
 * @param md     原始 markdown
 * @param maxLen 最大字符数(默认 150),超出截断并补「…」
 */
export function toExcerpt(md: string, maxLen = 150): string {
  if (!md) return '';
  const cleaned = stripInline(dropBlockLines(stripFrontmatter(md)));
  const text = cleaned.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+$/, '') + '…';
}
