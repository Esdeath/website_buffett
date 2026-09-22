import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDecisionBook, renderDecisionBookMarkdown, validateDeliveredDecisionBook, DECISION_BOOK_ROOT } from '../src/lib/decision-book.ts';
import { REPO_ROOT, sourceBookHash } from '../src/lib/source-book.ts';

const check = process.argv.includes('--check');
const book = getDecisionBook();
const manuscript = renderDecisionBookMarkdown(book);
const path = join(REPO_ROOT, 'buffett/books/buffett-xuan-gong-si.md');
const coverage = JSON.stringify({
  title: book.title, scope: '当前知识库全部原文正文；保持现有译稿，不等于全部发言均为巴菲特',
  sourceCount: book.sources.length, entryCount: book.entries.length,
  partCount: book.parts.length, chapterCount: book.chapters.length, sectionCount: book.sections.length,
  characterCount: book.stats.characterCount, manuscriptSha256: sourceBookHash(manuscript),
  sources: book.sources.map((source) => ({ path: source.path, sha256: source.hash, bodySha256: source.bodyHash,
    entries: book.entries.filter((entry) => entry.source.path === source.path).map((entry) => ({
      id: entry.id, start: entry.start, end: entry.end, sha256: entry.hash, sectionId: entry.sectionId,
    })),
  })),
}, null, 2) + '\n';

for (const [output, expected] of [[path, manuscript], [join(DECISION_BOOK_ROOT, 'coverage.json'), coverage]]) {
  if (check) {
    if (!existsSync(output) || readFileSync(output, 'utf8') !== expected) throw new Error(`${output}: 请运行 npm run build:decision-book 更新书稿`);
  } else writeFileSync(output, expected);
}
validateDeliveredDecisionBook(book, readFileSync(path, 'utf8'));
console.log(`✓ 《${book.title}》：${book.parts.length} 篇 ${book.chapters.length} 章 ${book.sections.length} 节；${book.sources.length} 篇原文、${book.entries.length} 则正文，全部逐字校验通过。`);
