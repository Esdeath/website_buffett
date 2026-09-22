import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getSourceBook, renderSourceBookMarkdown, sourceBookHash, sourceBookChapterReadingBlocks, SOURCE_BOOK_ROOT, REPO_ROOT } from '../src/lib/source-book.ts';

const check = process.argv.includes('--check');
const book = getSourceBook();
const markdown = renderSourceBookMarkdown(book);
const markdownPath = join(REPO_ROOT, 'buffett/books/buffett-yuanwen.md');
const reportPath = join(SOURCE_BOOK_ROOT, 'coverage.json');
const report = {
  title: book.title, sourceCount: book.sources.length, entryCount: book.entries.length,
  characterCount: book.stats.characterCount, markdownHash: sourceBookHash(markdown),
  sources: book.sources.map((source) => ({ path: source.path, sha256: source.hash, bodySha256: source.bodyHash,
    characterCount: source.body.length, entries: book.entries.filter((e) => e.source.path === source.path).map((e) => ({
      id: e.id, start: e.start, end: e.end, startLine: e.startLine, endLine: e.endLine, sha256: e.hash, sectionId: e.sectionId,
    })) })),
};
const reportText = JSON.stringify(report, null, 2) + '\n';
if (check) {
  for (const [path, expected] of [[markdownPath, markdown], [reportPath, reportText]]) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== expected) throw new Error(`${path}: 书稿或覆盖清单过期，请运行 npm run build:source-book`);
  }
} else {
  mkdirSync(SOURCE_BOOK_ROOT, { recursive: true });
  writeFileSync(markdownPath, markdown);
  writeFileSync(reportPath, reportText);
}
// 对实际交付书稿重新提取，而不只验证内存中的源切片。
const delivered = check ? readFileSync(markdownPath, 'utf8') : markdown;
const byId = new Map(book.entries.map((e) => [e.id, e]));
const preserved = [...delivered.matchAll(/<!-- 原文开始 (\S+) sha256:([a-f0-9]+) -->\n([\s\S]*?)\n<!-- 原文结束 \1 -->/g)];
if (preserved.length !== byId.size) throw new Error('交付书稿的原文条数不一致');
const expectedOrder = book.chapters.flatMap((chapter) => sourceBookChapterReadingBlocks(chapter).flatMap((block) => block.entries.map((entry) => entry.id)));
if (preserved.some((match, index) => match[1] !== expectedOrder[index])) throw new Error('交付书稿未按章内核心先读、延伸后读的顺序编排');
for (const [, id, hash, body] of preserved) {
  const entry = byId.get(id);
  if (!entry || body !== entry.body || sourceBookHash(body) !== hash) throw new Error(`交付书稿的原文被修改：${id}`);
  byId.delete(id);
}
if (byId.size) throw new Error('交付书稿存在遗漏');
console.log(`✓ 原文主题全编：${book.sources.length} 篇，${book.entries.length} 则，${book.chapters.length} 章，${book.sections.length} 节；全文逐字覆盖及书稿校验通过。`);
if (process.argv.includes('--review')) {
  const reviewPath = join(REPO_ROOT, 'output/source-book-review.json');
  mkdirSync(join(REPO_ROOT, 'output'), { recursive: true });
  writeFileSync(reviewPath, JSON.stringify(book.entries.map((e) => ({ id: e.id, title: e.title, source: e.source.title,
    sectionId: e.sectionId, matchScore: e.matchScore, matchMargin: e.matchMargin, classification: e.classification,
    length: e.body.length, lead: e.body.slice(0, 650) })), null, 2));
  console.log(`编排复核：${reviewPath}`);
}
