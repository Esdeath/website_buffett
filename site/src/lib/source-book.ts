import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yaml } from 'js-yaml';
import { remark } from 'remark';
import { sourceUrl } from './source-url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SOURCE_BOOK_ROOT = join(REPO_ROOT, 'buffett/books/buffett-yuanwen');
export interface OutlineSection { id: string; title: string; terms: string[]; titleTerms?: string[]; titlePriority?: number }
export interface OutlineChapter { id: string; slug: string; title: string; part: string; introduction: string; sections: OutlineSection[] }
export interface OutlinePart { id: string; title: string; chapterIds: string[]; kind?: 'body' | 'appendix'; introduction?: string }
export interface SourceBookOutline { slug: string; title: string; subtitle: string; parts: OutlinePart[]; chapters: OutlineChapter[] }
export interface BookSource {
  path: string; title: string; slug: string; category: string; year: number; url: string;
  hash: string; bodyHash: string; body: string; bodyOffset: number; bodyLine: number;
}
export interface SourceBookEntry {
  id: string; title: string; body: string; source: BookSource; start: number; end: number;
  startLine: number; endLine: number; hash: string; sectionId: string;
  matchScore: number; matchMargin: number; classification: 'rule' | 'reviewed';
  readingRole?: 'core' | 'further' | 'appendix'; readingStage?: string; editorialReason?: string; duplicateOf?: string;
}
export interface SourceBookSection extends OutlineSection { chapterId: string; entries: SourceBookEntry[]; coreCount?: number }
export interface SourceBookChapter extends Omit<OutlineChapter, 'part' | 'sections'> {
  part: OutlinePart; sections: SourceBookSection[];
}
export interface SourceBook {
  slug: string; title: string; subtitle: string;
  parts: (OutlinePart & { chapters: SourceBookChapter[] })[];
  chapters: SourceBookChapter[]; sections: SourceBookSection[]; entries: SourceBookEntry[];
  sources: BookSource[]; editorial?: SourceBookEditing;
  stats: { sourceCount: number; entryCount: number; characterCount: number; coreEntryCount?: number; furtherEntryCount?: number; appendixEntryCount?: number };
}
export interface SourceBookEditing {
  revision: string; methodNotes: string[];
  sectionLeads: Record<string, { id: string; stage: string; reason: string }[]>;
  moves: Record<string, { sectionId: string; reason: string; duplicateOf?: string }>;
  previousSections?: Record<string, string>;
}
export const readingStageLabel: Record<string, string> = { principle: '认识问题', mechanism: '理解机制', application: '联系实践', boundary: '辨明边界' };
const chronological = (a: SourceBookEntry, b: SourceBookEntry) => a.source.year - b.source.year || a.source.path.localeCompare(b.source.path) || a.start - b.start;

/** 编辑次序只作用于条目位置与标签，正文和原文哈希始终不变。 */
export function applySourceBookEditing(entries: SourceBookEntry[], sections: SourceBookSection[], appendixIds: Set<string>, editing?: SourceBookEditing) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const bySection = new Map(sections.map((section) => [section.id, section]));
  // 目录换序不能改变旧词表同分时的归属；只应用明确复核过的移位。
  for (const [id, sectionId] of Object.entries(editing?.previousSections ?? {})) {
    if (!byId.has(id) || !bySection.has(sectionId)) throw new Error(`重编前归属引用失效：${id}`);
    byId.get(id)!.sectionId = sectionId;
  }
  for (const [id, move] of Object.entries(editing?.moves ?? {})) {
    const entry = byId.get(id);
    if (!entry || !bySection.has(move.sectionId)) throw new Error(`重编移位引用失效：${id}`);
    if (move.duplicateOf && (!byId.has(move.duplicateOf) || move.duplicateOf === id)) throw new Error(`重复版本引用失效：${id}`);
    entry.sectionId = move.sectionId; entry.editorialReason = move.reason; entry.duplicateOf = move.duplicateOf; entry.classification = 'reviewed';
  }
  for (const section of sections) {
    section.entries = entries.filter((entry) => entry.sectionId === section.id).sort(chronological);
    const appendix = appendixIds.has(section.id);
    const leads = editing?.sectionLeads[section.id] ?? [];
    const leadIds = new Set(leads.map((lead) => lead.id));
    if (leadIds.size !== leads.length) throw new Error(`主线原文重复：${section.id}`);
    for (const lead of leads) {
      if (!byId.has(lead.id) || byId.get(lead.id)!.sectionId !== section.id) throw new Error(`主线原文不属于本节：${lead.id}`);
      if (!readingStageLabel[lead.stage]) throw new Error(`主线阅读层次无效：${lead.id}`);
    }
    for (const entry of section.entries) entry.readingRole = appendix ? 'appendix' : leadIds.has(entry.id) ? 'core' : 'further';
    for (const lead of leads) byId.get(lead.id)!.readingStage = readingStageLabel[lead.stage];
    if (editing) section.entries = [...leads.map((lead) => byId.get(lead.id)!), ...section.entries.filter((entry) => !leadIds.has(entry.id))];
    section.coreCount = leads.length;
  }
  for (const id of Object.keys(editing?.sectionLeads ?? {})) if (!bySection.has(id)) throw new Error(`主线引用未知小节：${id}`);
}
export const sourceBookHash = (text: string) => createHash('sha256').update(text).digest('hex');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((item) => item.isDirectory() ? walk(join(dir, item.name)) : item.name.endsWith('.md') ? [join(dir, item.name)] : []).sort();
export const plainNodeText = (node: any): string => node.value ?? (node.children ?? []).map(plainNodeText).join('');

export function parseBookSource(text: string, path: string): BookSource {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front) throw new Error(`${path}: 原文缺少 frontmatter`);
  const data = yaml(front[1]) as Record<string, any>;
  const body = text.slice(front[0].length);
  return { path, title: data.title, slug: data.slug, category: data.category,
    year: Number(String(data.title).match(/(?:18|19|20)\d{2}/)?.[0] ?? 0),
    url: sourceUrl(data.category, data.slug), hash: sourceBookHash(text), bodyHash: sourceBookHash(body),
    body, bodyOffset: front[0].length, bodyLine: front[0].split('\n').length };
}

// 只在原有标题或明确编号问题起点分块；不在回答、表格、列表、代码块内部断开。
// 偏移保留原始空格、换行、标点及 HTML 锚点，拼接后必须逐字还原完整正文。
export function splitBookSource(source: BookSource, manual: { startText: string; title: string }[] = []): Omit<SourceBookEntry, 'sectionId' | 'matchScore' | 'matchMargin' | 'classification'>[] {
  const tree = remark().parse(source.body);
  const nodes = tree.children as any[];
  const headings = nodes.filter((n) => n.type === 'heading' && !(n.depth === 1 && n === nodes[0]) && !/^(?:上午场|下午场|上午|下午|问答环节|問答環節)$/.test(plainNodeText(n).trim()));
  const question = source.category === '访谈与文章'
    ? /^(?:(?:问题|問题|问|Q(?:uestion)?)\s*(?:\d+|[：:])|第[一二三四五六七八九十百零〇\d]+问|\d+\s*[、.．，,：:）)])/i
    : /^(?:(?:问题|問题|问|Q(?:uestion)?)\s*\d+|第[一二三四五六七八九十百零〇\d]+问|\d+\s*[、.．）)])/i;
  const questionDepths = headings.filter((n) => question.test(plainNodeText(n))).map((n) => n.depth);
  const depth = questionDepths.length ? Math.min(...questionDepths) : Math.min(...headings.map((n) => n.depth));
  const boundaries: { offset: number; title: string }[] = [{ offset: 0, title: source.title }];
  for (const node of nodes) {
    const text = plainNodeText(node).trim();
    const isHeading = node.type === 'heading' && node.depth <= depth && node !== nodes[0];
    const isQuestionParagraph = node.type === 'paragraph' && /^(?:(?:Q(?:uestion)?|问题)\s*\d+\s*[：:.、]|第[一二三四五六七八九十百零〇\d]+问[：:])/i.test(text);
    if (isHeading || isQuestionParagraph) {
      const offset = node.position.start.offset;
      if (offset > 0) boundaries.push({ offset, title: text });
    }
  }
  for (const boundary of manual) {
    const start = source.body.indexOf(boundary.startText);
    if (start < 0 || source.body.indexOf(boundary.startText, start + 1) >= 0) throw new Error(`${source.path}: 人工分节锚点缺失或不唯一 ${boundary.startText}`);
    if (!nodes.some((n) => n.position.start.offset === start)) throw new Error(`${source.path}: 人工分节不在完整段落起点 ${boundary.startText}`);
    const previous = boundaries.find((b) => b.offset === start);
    if (previous) previous.title = boundary.title;
    else boundaries.push({ offset: start, title: boundary.title });
  }
  boundaries.sort((a, b) => a.offset - b.offset);
  // 已核对的问答范围可能覆盖多个小标题；起点锚记与问答一起移动。
  const anchors = [...source.body.matchAll(/<a\s+id="(qa-(?:source-)?q\d+)-(start|end)"[^>]*><\/a>/g)];
  for (const anchor of anchors.filter((a) => a[2] === 'start')) {
    const close = anchors.find((a) => a[1] === anchor[1] && a[2] === 'end' && a.index! > anchor.index!);
    if (!close) continue;
    const inside = boundaries.filter((b) => b.offset > anchor.index! && b.offset < close.index!);
    if (inside.length) {
      inside[0].offset = anchor.index!;
      for (const extra of inside.slice(1)) boundaries.splice(boundaries.indexOf(extra), 1);
    }
  }
  // 标题本身/场次标记与紧邻正文一起保留，避免制造空条目。
  for (let i = boundaries.length - 2; i >= 0; i--) {
    const chunk = source.body.slice(boundaries[i].offset, boundaries[i + 1].offset);
    const meaningful = remark().parse(chunk).children.some((n: any) => !['heading', 'html', 'thematicBreak'].includes(n.type));
    if (!meaningful) { boundaries[i].title = boundaries[i + 1].title; boundaries.splice(i + 1, 1); }
  }
  const frontLineCount = source.bodyLine - 1;
  return boundaries.map((boundary, index) => {
    const start = boundary.offset;
    const end = boundaries[index + 1]?.offset ?? source.body.length;
    const body = source.body.slice(start, end);
    return { id: `${source.slug}--${String(index + 1).padStart(3, '0')}`, title: boundary.title, body, source,
      start, end, hash: sourceBookHash(body),
      startLine: frontLineCount + source.body.slice(0, start).split('\n').length,
      endLine: frontLineCount + source.body.slice(0, end).replace(/\n$/, '').split('\n').length };
  });
}

export function classifyBookEntry(entry: { title: string; body: string; source: BookSource }, sections: OutlineSection[]) {
  const heading = entry.title.toLowerCase();
  const lead = entry.body.slice(0, 1000).toLowerCase();
  const body = entry.body.toLowerCase();
  const scores = sections.map((section) => {
    let score = 0;
    for (const original of section.terms) {
      const term = original.toLowerCase();
      if (!term) continue;
      // 标题及提问比回答中的举例更能确定归属；词频设上限，避免长文被单一词劫持。
      const weight = Math.min(3, 1 + term.length / 5);
      if (heading.includes(term)) score += 14 * weight;
      if (lead.includes(term)) score += 3 * weight;
      const count = body.split(term).length - 1;
      if (count) score += Math.min(4, count) * weight;
    }
    const titleHits = (section.titleTerms ?? []).filter((term) => heading.includes(term.toLowerCase()));
    if (titleHits.length) score = 1000 * (section.titlePriority ?? 2) + Math.max(...titleHits.map((term) => term.length)) * 20 + Math.min(80, score / 5);
    return { sectionId: section.id, score };
  }).sort((a, b) => b.score - a.score);
  return { sectionId: scores[0].score ? scores[0].sectionId : 'mu-lu-yi-zhu-yu-bu-chong-zi-liao', matchScore: scores[0].score, matchMargin: scores[0].score - (scores[1]?.score ?? 0) };
}

let cache: SourceBook | undefined;
export function getSourceBook(): SourceBook {
  if (cache) return cache;
  const outline: SourceBookOutline = JSON.parse(readFileSync(join(SOURCE_BOOK_ROOT, 'outline.json'), 'utf8'));
  const overridesPath = join(SOURCE_BOOK_ROOT, 'placements.json');
  const overrides: Record<string, string> = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {};
  for (const filename of readdirSync(SOURCE_BOOK_ROOT).filter((f) => /^placements-[a-z]+\.json$/.test(f)).sort()) {
    const extra = JSON.parse(readFileSync(join(SOURCE_BOOK_ROOT, filename), 'utf8'));
    for (const [id, sectionId] of Object.entries(extra)) {
      if (overrides[id] && overrides[id] !== sectionId) throw new Error(`重复的人工编排冲突 ${id}`);
      overrides[id] = sectionId as string;
    }
  }
  const boundariesPath = join(SOURCE_BOOK_ROOT, 'boundaries.json');
  const boundaries: Record<string, { startText: string; title: string }[]> = existsSync(boundariesPath) ? JSON.parse(readFileSync(boundariesPath, 'utf8')) : {};
  const sections: SourceBookSection[] = outline.chapters.flatMap((c) => c.sections.map((s) => ({ ...s, chapterId: c.id, entries: [] })));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  if (sectionById.size !== sections.length) throw new Error('全编小节 ID 重复');
  const sources = ['berkshire', 'interview', 'shareholders'].flatMap((dir) => walk(join(REPO_ROOT, 'buffett', dir)))
    .map((path) => parseBookSource(readFileSync(path, 'utf8'), path.slice(REPO_ROOT.length)))
    .sort((a, b) => a.year - b.year || a.path.localeCompare(b.path));
  const sourcePaths = new Set(sources.map((s) => s.path));
  for (const path of Object.keys(boundaries)) if (!sourcePaths.has(path)) throw new Error(`分节引用未知原文 ${path}`);
  const entries: SourceBookEntry[] = sources.flatMap((source) => splitBookSource(source, boundaries[source.path])).map((entry) => {
    const result = classifyBookEntry(entry, sections);
    const sectionId = overrides[entry.id] ?? result.sectionId;
    if (!sectionById.has(sectionId)) throw new Error(`${entry.id}: 未知小节 ${sectionId}`);
    return { ...entry, ...result, sectionId, classification: overrides[entry.id] ? 'reviewed' : 'rule' };
  });
  const ids = new Set(entries.map((e) => e.id));
  for (const id of Object.keys(overrides)) if (!ids.has(id)) throw new Error(`编排失效：${id} 在原文中已不存在`);
  const editingPath = join(SOURCE_BOOK_ROOT, 'editing.json');
  const editing: SourceBookEditing | undefined = existsSync(editingPath) ? JSON.parse(readFileSync(editingPath, 'utf8')) : undefined;
  const appendixChapterIds = new Set(outline.parts.filter((part) => part.kind === 'appendix').flatMap((part) => part.chapterIds));
  applySourceBookEditing(entries, sections, new Set(sections.filter((section) => appendixChapterIds.has(section.chapterId)).map((section) => section.id)), editing);
  const chapters: SourceBookChapter[] = outline.chapters.map((chapter) => {
    const part = outline.parts.find((p) => p.id === chapter.part);
    if (!part) throw new Error(`${chapter.id}: 未知篇目`);
    return { ...chapter, part, sections: chapter.sections.map((s) => sectionById.get(s.id)!) };
  });
  cache = { ...outline, chapters, sections, entries, sources, editorial: editing,
    parts: outline.parts.map((p) => ({ ...p, chapters: p.chapterIds.map((id) => {
      const chapter = chapters.find((c) => c.id === id);
      if (!chapter) throw new Error(`篇目引用未知章 ${id}`);
      return chapter;
    }) })),
    stats: { sourceCount: sources.length, entryCount: entries.length, characterCount: sources.reduce((sum, s) => sum + s.body.length, 0),
      coreEntryCount: entries.filter((entry) => entry.readingRole === 'core').length,
      furtherEntryCount: entries.filter((entry) => entry.readingRole === 'further').length,
      appendixEntryCount: entries.filter((entry) => entry.readingRole === 'appendix').length } };
  validateSourceBook(cache);
  return cache;
}

export function validateSourceBook(book: SourceBook) {
  const ids = new Set(book.entries.map((e) => e.id));
  if (ids.size !== book.entries.length) throw new Error('原文条目 ID 重复');
  const placed = book.parts.flatMap((p) => p.chapters.flatMap((c) => c.sections.flatMap((s) => s.entries)));
  if (placed.length !== ids.size || new Set(placed.map((e) => e.id)).size !== ids.size || placed.some((e) => !ids.has(e.id))) throw new Error('原文编排存在遗漏或重复');
  for (const source of book.sources) {
    const entries = book.entries.filter((e) => e.source.path === source.path).sort((a, b) => a.start - b.start);
    let next = 0;
    for (const entry of entries) {
      if (entry.start !== next || source.body.slice(entry.start, entry.end) !== entry.body || sourceBookHash(entry.body) !== entry.hash) throw new Error(`${entry.id}: 原文范围或文字被修改`);
      next = entry.end;
    }
    if (next !== source.body.length || entries.map((e) => e.body).join('') !== source.body || sourceBookHash(source.body) !== source.bodyHash) throw new Error(`${source.path}: 原文正文未被完整保留`);
  }
}

export function sourceBookSectionUrl(book: SourceBook, section: SourceBookSection) {
  const chapter = book.chapters.find((c) => c.id === section.chapterId)!;
  return `/books/${book.slug}/${chapter.slug}/${section.id}/`;
}

export function sourceBookChapterReadingBlocks(chapter: SourceBookChapter, edited = true) {
  if (!edited || chapter.part.kind === 'appendix') return chapter.sections.map((section) => ({ section,
    id: section.id, title: section.title, kind: 'appendix' as const, entries: section.entries }));
  return [
    ...chapter.sections.map((section) => ({ section, id: section.id, title: section.title, kind: 'core' as const,
      entries: section.entries.filter((entry) => entry.readingRole === 'core') })),
    ...chapter.sections.map((section) => ({ section, id: `${section.id}--further`, title: `同题延伸：${section.title}`, kind: 'further' as const,
      entries: section.entries.filter((entry) => entry.readingRole !== 'core') })),
  ].filter((block) => block.entries.length);
}

export function renderSourceBookMarkdown(book: SourceBook): string {
  const edited = book.slug === 'buffett-yuanwen' && !!book.editorial;
  const method = edited ? '每章先连续阅读各节的核心原文，依次理解问题、机制、实践与边界；其余同题材料集中于本章末，内部按年代排列。纯会务、资料说明、历史统计和重复版本收入附录。' : '同节材料按年份及原文次序排列。';
  let text = `# ${book.title}\n\n${book.subtitle}\n\n## 编排说明\n\n本书收录站内 ${book.stats.sourceCount} 篇原文，共 ${book.sections.length} 个主题小节。${method}篇章结构、部分条目标题、导读与出处由编者整理，标记内的正文逐字保留站内原稿，未作删节、润色或改写；原稿已有的省略、译注和其他发言者署名均照录。书信按原有小节编排，不改造成问答。跨主题的完整问答归入一个主节。无明确分节的长篇保留连贯原文。\n\n原文包含不同作者及译者的记录，并非全部由巴菲特本人发言；这里的“原文不变”指与仓库现有文本一致，不代表重新校译或独立核实。\n\n`;
  if (edited) text += `### 阅读顺序\n\n${book.editorial!.methodNotes.map((note) => `- ${note}`).join('\n')}\n\n`;
  text += '## 目录\n\n';
  for (const part of book.parts) {
    text += `### ${part.title}\n\n`;
    for (const chapter of part.chapters) {
      text += `- [${chapter.title}](#${chapter.id})\n`;
      for (const section of chapter.sections) text += `  - [${section.title}](#${section.id})（${section.entries.length} 则）\n`;
    }
    text += '\n';
  }
  for (const part of book.parts) {
    text += `\n# ${part.title}\n\n`;
    for (const chapter of part.chapters) {
      text += `<a id="${chapter.id}"></a>\n\n## ${chapter.title}\n\n> 编者导读：${chapter.introduction}\n\n`;
      let furtherStarted = false;
      for (const block of sourceBookChapterReadingBlocks(chapter, edited)) {
        if (block.kind === 'further' && !furtherStarted) { text += '## 本章同题延伸\n\n以下材料按原文年代排列，供比较观点的延续、案例和不同语境。\n\n'; furtherStarted = true; }
        text += `<a id="${block.id}"></a>\n\n### ${block.title}\n\n`;
        for (const entry of block.entries) {
          if (edited && entry.readingStage) text += `*阅读层次：${entry.readingStage}*\n\n`;
          text += `<a id="${entry.id}"></a>\n\n#### ${entry.title.replace(/\n/g, ' ')}\n\n*出处：[${entry.source.title}](https://buffett.ayaseeri.com${entry.source.url})；${entry.source.category}；原文件第 ${entry.startLine}–${entry.endLine} 行。*\n\n<!-- 原文开始 ${entry.id} sha256:${entry.hash} -->\n`;
          text += entry.body;
          text += `\n<!-- 原文结束 ${entry.id} -->\n\n`;
        }
      }
    }
  }
  return text;
}
