import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getSourceBook, REPO_ROOT, sourceBookHash } from '../src/lib/source-book.ts';

const sourceBook = getSourceBook();
const root = join(REPO_ROOT, 'buffett/books/buffett-jingbian');
const originalById = new Map(sourceBook.entries.map((entry) => [entry.id, entry]));
const partial = process.argv.includes('--partial');
const check = process.argv.includes('--check');
const provenance = [];
const seenQuestions = new Set();
const parts = sourceBook.parts.filter((part) => part.kind !== 'appendix').map((part) => ({
  id: part.id, title: part.title, chapters: part.chapters.flatMap((originalChapter) => {
    const path = join(root, 'chapters', `${originalChapter.id}.json`);
    if (!existsSync(path) && partial) return [];
    const chapter = JSON.parse(readFileSync(path, 'utf8'));
    if (chapter.id !== originalChapter.id) throw new Error(`章节 ID 错误：${path}`);
    if (chapter.questions.length < 6 || chapter.questions.length > 8) throw new Error(`${chapter.id}: 应有 6–8 个问答`);
    const allowedSections = new Set(originalChapter.sections.map((section) => section.id));
    const coveredSections = new Set();
    const questionIds = new Set();
    const questions = chapter.questions.map((q) => {
      const id = `${chapter.id}-${q.id}`;
      if (questionIds.has(id) || !/^q\d{2}$/.test(q.id)) throw new Error(`问答 ID 无效：${id}`);
      questionIds.add(id);
      if (!q.question.endsWith('？') || /https?:|出处|原文第|\[\d+\]/.test(q.question)) throw new Error(`问题格式错误：${id}`);
      if (seenQuestions.has(q.question)) throw new Error(`问题重复：${q.question}`);
      seenQuestions.add(q.question);
      if (q.paragraphs.length < 2 || q.paragraphs.length > 5 || q.paragraphs.some((p) => typeof p !== 'string' || !p.trim() || /https?:|\[\d+\]|<\/?\w|\n/.test(p))) throw new Error(`段落或正文标注错误：${id}`);
      if (!q.sourceIds.length || !q.sectionIds.length || !q.speakers.length) throw new Error(`缺少内部出处：${id}`);
      for (const sid of q.sectionIds) {
        if (!allowedSections.has(sid)) throw new Error(`${id}: 非本章主题 ${sid}`);
        coveredSections.add(sid);
      }
      const sources = [...new Set(q.sourceIds)].map((sid) => {
        const entry = originalById.get(sid);
        if (!entry) throw new Error(`${id}: 原文引用不存在 ${sid}`);
        return { id: sid, title: entry.source.title, entryTitle: entry.title,
          url: `https://buffett.ayaseeri.com${entry.source.url}`, year: entry.source.year,
          path: entry.source.path, startLine: entry.startLine, endLine: entry.endLine, hash: entry.hash };
      });
      const text = q.paragraphs.join('\n\n');
      provenance.push({ id, question: q.question, speakers: q.speakers, sectionIds: q.sectionIds,
        editedSha256: sourceBookHash(text), editedCharacters: text.length, sources });
      return { id, question: q.question, paragraphs: q.paragraphs, speakers: q.speakers,
        sectionIds: q.sectionIds, sources };
    });
    if ([...allowedSections].some((sid) => !coveredSections.has(sid))) throw new Error(`${chapter.id}: 主题未被覆盖`);
    return [{ id: chapter.id, title: chapter.title, introduction: chapter.introduction || '', questions }];
  }),
})).filter((part) => part.chapters.length);

const chapters = parts.flatMap((part) => part.chapters);
chapters.forEach((chapter, index) => chapter.number = index + 1);
const allQuestions = chapters.flatMap((chapter) => chapter.questions);
const answerCharacters = allQuestions.reduce((sum, q) => sum + q.paragraphs.join('').length, 0);
const book = {
  slug: 'buffett-jingbian', title: '巴菲特与芒格投资问答', edition: '精编版',
  subtitle: '从投资判断到经营与人生', revision: '2026-09-21-concise-edition',
  editingNote: '本书将巴菲特与芒格的书信、访谈和股东大会讨论整理为主题问答，删去寒暄、重复和旁枝，合并同题论述，并调整段落次序。问题及回答均经过编辑提炼，并非逐字实录；论点、必要案例与适用条件以原始材料为依据。历史案例保留当时的语境，资料来源统一列于书末。',
  parts, stats: { partCount: parts.length, chapterCount: chapters.length, questionCount: allQuestions.length,
    answerCharacters, originalCharacters: sourceBook.stats.characterCount,
    sourceEntries: new Set(provenance.flatMap((q) => q.sources.map((s) => s.id))).size,
    sourceDocuments: new Set(provenance.flatMap((q) => q.sources.map((s) => s.path))).size },
};
let markdown = `# ${book.title}\n\n${book.edition} · ${book.subtitle}\n\n${book.editingNote}\n\n## 目录\n\n`;
for (const part of parts) {
  markdown += `### ${part.title}\n\n`;
  for (const chapter of part.chapters) markdown += `- 第${chapter.number}章 ${chapter.title}\n`;
  markdown += '\n';
}
for (const part of parts) {
  markdown += `# ${part.title}\n\n`;
  for (const chapter of part.chapters) {
    markdown += `## 第${chapter.number}章 ${chapter.title}\n\n`;
    if (chapter.introduction) markdown += `${chapter.introduction}\n\n`;
    for (const q of chapter.questions) markdown += `### ${q.question}\n\n${q.paragraphs.join('\n\n')}\n\n`;
  }
}
markdown += '# 资料来源\n\n以下按章节与问题列出整理依据。相同问题合并使用多则材料，所列来源对应编辑后的完整回答。\n\n';
for (const chapter of chapters) {
  markdown += `## 第${chapter.number}章 ${chapter.title}\n\n`;
  for (const q of chapter.questions) {
    markdown += `### ${q.question}\n\n`;
    for (const source of q.sources) markdown += `- [${source.title}](${source.url})：${source.entryTitle}\n`;
    markdown += '\n';
  }
}
const out = [
  [join(root, 'book.json'), JSON.stringify(book, null, 2) + '\n'],
  [join(root, 'provenance.json'), JSON.stringify({ revision: book.revision, questions: provenance }, null, 2) + '\n'],
  [join(REPO_ROOT, 'buffett/books/buffett-jingbian.md'), markdown],
];
mkdirSync(root, { recursive: true });
for (const [path, text] of out) {
  if (check) { if (!existsSync(path) || readFileSync(path, 'utf8') !== text) throw new Error(`精编稿过期：${path}`); }
  else writeFileSync(path, text);
}
console.log(`✓ 精编问答：${parts.length} 篇、${chapters.length} 章、${allQuestions.length} 问、回答 ${answerCharacters} 字符；来源与主题覆盖校验通过。`);
