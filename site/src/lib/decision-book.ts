import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getSourceBook, renderSourceBookMarkdown, validateSourceBook, sourceBookHash,
  REPO_ROOT, type SourceBook, type SourceBookChapter,
} from './source-book';

export const DECISION_BOOK_ROOT = join(REPO_ROOT, 'buffett/books/buffett-xuan-gong-si');
export interface DecisionExcerpt { sourcePath: string; quote: string; title: string }
export interface DecisionStage {
  id: string; title: string; question: string; yes: string; no: string; unknown: string;
  editorNote: string; readingChapterIds: string[]; excerpts: DecisionExcerpt[];
}
interface DecisionOutline {
  slug: string; title: string; subtitle: string;
  parts: { id: string; title: string; introduction: string; chapterIds: string[] }[];
  chapterIntroductions: Record<string, string>; methodNotes: string[];
}
export type DecisionBook = SourceBook & {
  outline: DecisionOutline;
  evidence: { overall: DecisionExcerpt; stages: DecisionStage[] };
};

const chapterNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二', '二十三', '二十四'];
let cache: DecisionBook | undefined;

export function validateDecisionEvidence(book: SourceBook, evidence: DecisionBook['evidence']) {
  if (new Set(evidence.stages.map((stage) => stage.id)).size !== evidence.stages.length) throw new Error('决策节点 ID 重复');
  for (const excerpt of [evidence.overall, ...evidence.stages.flatMap((s) => s.excerpts)]) {
    const source = book.sources.find((s) => s.path === excerpt.sourcePath);
    if (!source || !excerpt.quote.trim() || !source.body.includes(excerpt.quote)) {
      throw new Error(`决策导读引文不是原文件的连续文字：${excerpt.title}`);
    }
  }
  for (const stage of evidence.stages) {
    if (!/^[a-z][a-z0-9-]+$/.test(stage.id)) throw new Error(`决策节点 ID 无效：${stage.id}`);
    if (!stage.readingChapterIds?.length || stage.readingChapterIds.some((id) => !book.chapters.some((c) => c.id === id))) {
      throw new Error(`${stage.id}: 延伸阅读缺失或指向未知章节`);
    }
  }
}

export function getDecisionBook(): DecisionBook {
  if (cache) return cache;
  const original = getSourceBook();
  const outline: DecisionOutline = JSON.parse(readFileSync(join(DECISION_BOOK_ROOT, 'outline.json'), 'utf8'));
  const evidence: DecisionBook['evidence'] = JSON.parse(readFileSync(join(DECISION_BOOK_ROOT, 'evidence.json'), 'utf8'));
  const ids = outline.parts.flatMap((part) => part.chapterIds);
  if (new Set(ids).size !== original.chapters.length || ids.length !== original.chapters.length || ids.some((id) => !original.chapters.some((c) => c.id === id))) {
    throw new Error('选公司原文书的目录必须覆盖全部章节，且不得重复');
  }
  // 后继者来信归入补充资料；复制编排对象，不改动原文全编的缓存或任何正文。
  const supplementalSection = original.chapters.find((c) => c.id === 'chapter-24')!.sections.find((section) => section.id === 'mu-lu-yi-zhu-yu-bu-chong-zi-liao')!.id;
  const entries = original.entries.map((entry) => decisionSourceNote(entry.source)
    ? { ...entry, sectionId: supplementalSection, classification: 'reviewed' as const } : entry);
  const chapters: SourceBookChapter[] = ids.map((id, index) => {
    const chapter = original.chapters.find((c) => c.id === id)!;
    const part = outline.parts.find((p) => p.chapterIds.includes(id))!;
    return { ...chapter, part, sections: chapter.sections.map((section) => ({ ...section,
      entries: entries.filter((entry) => entry.sectionId === section.id)
        .sort((a, b) => a.source.year - b.source.year || a.source.path.localeCompare(b.source.path) || a.start - b.start) })),
      title: chapter.title.replace(/^第.+?章/, `第${chapterNumbers[index] ?? index + 1}章`),
      introduction: outline.chapterIntroductions[id] ?? chapter.introduction };
  });
  cache = { ...original, slug: outline.slug, title: outline.title, subtitle: outline.subtitle, outline, evidence, chapters, entries,
    sections: chapters.flatMap((c) => c.sections),
    parts: outline.parts.map((p) => ({ ...p, chapters: p.chapterIds.map((id) => chapters.find((c) => c.id === id)!) })),
  };
  validateSourceBook(cache);
  validateDecisionEvidence(cache, evidence);
  return cache;
}

export function decisionSourceNote(source: { slug: string }): string | undefined {
  return source.slug === '2026-a-bei-er-zhi-gu-dong-xin'
    ? '补充材料：本信作者为格雷格·阿贝尔。原文件正文标题误写“巴菲特”，与其标题元数据及内容不一致；这里保留原稿，另作说明，不将本信归为巴菲特发言。'
    : undefined;
}

export function decisionExcerptSource(book: DecisionBook, excerpt: DecisionExcerpt) {
  return book.sources.find((source) => source.path === excerpt.sourcePath)!;
}

export function decisionExcerptLine(book: DecisionBook, excerpt: DecisionExcerpt) {
  const source = decisionExcerptSource(book, excerpt);
  return source.bodyLine - 1 + source.body.slice(0, source.body.indexOf(excerpt.quote)).split('\n').length;
}

export function renderDecisionBookMarkdown(book: DecisionBook): string {
  const quote = (excerpt: DecisionExcerpt) => {
    const source = decisionExcerptSource(book, excerpt);
    return `**原文选录：${excerpt.title}**\n\n${excerpt.quote.split('\n').map((line) => `> ${line}`).join('\n')}\n\n出处：[${source.title}](https://buffett.ayaseeri.com${source.url})；原文件第 ${decisionExcerptLine(book, excerpt)} 行起。\n\n`;
  };
  let opening = `## 怎样使用这本书（编者序）\n\n本书围绕一个问题展开：在把钱交给一家企业之前，应当弄清什么？从投资者能够知道的事，到企业的经济特性、经营者、财报、风险与价格，再到买入后的资本配置和持有判断，依次阅读相关原文。宏观、制度、人生与社会议题保留在后续篇章，会议会务材料与独立的原始资料列入附录；原有译注随上下文保留。\n\n本书的正文覆盖当前知识库全部 ${book.sources.length} 篇原文，不把它称为巴菲特一生言论的全集。“全部专题”指本书目录下的 ${book.sections.length} 个主题小节；一则原文可能涉及多个问题，每个原文单元只收录一次；跨节上下文可由出处返回原稿连读。\n\n${book.outline.methodNotes.map((note) => `- ${note}`).join('\n')}\n\n下面的树是编者依据原文整理的学习和研究顺序，并非巴菲特本人公布的固定决策树。它没有统一的市盈率、ROE 或折价门槛；“不知道”意味着继续研究或暂缓，不能自动判定企业不好。导读中的选录会在正文中保留完整上下文，选录不计入正文的覆盖统计。\n\n## 原文总纲\n\n${quote(book.evidence.overall)}## 公司选择决策树（编者整理）\n\n`;
  for (const [index, stage] of book.evidence.stages.entries()) {
    opening += `### ${index + 1}. ${stage.title}\n\n**判断问题：${stage.question}**\n\n- 是：${stage.yes}\n- 否：${stage.no}\n- 不知道：${stage.unknown}\n\n编者说明：${stage.editorNote}\n\n`;
    opening += stage.excerpts.map(quote).join('');
    opening += `深入阅读：${stage.readingChapterIds.map((id) => {
      const chapter = book.chapters.find((c) => c.id === id)!;
      return `[${chapter.title}](#${chapter.id})`;
    }).join('、')}。\n\n`;
  }
  let markdown = renderSourceBookMarkdown(book);
  markdown = markdown.replace('跨主题的完整问答归入一个主节。', '原文按既有标题及已核定的分界编排；跨小节的追问可通过出处回到全文连读。');
  markdown = markdown.replace('## 目录\n', `${opening}## 目录\n`);
  for (const part of book.outline.parts) markdown = markdown.replace(`\n# ${part.title}\n\n`, `\n# ${part.title}\n\n> 编者篇首导读：${part.introduction}\n\n`);
  for (const entry of book.entries) {
    const note = decisionSourceNote(entry.source);
    if (note) markdown = markdown.replace(`<!-- 原文开始 ${entry.id} `, `> 编者署名说明：${note}\n\n<!-- 原文开始 ${entry.id} `);
  }
  return markdown;
}

export function validateDeliveredDecisionBook(book: DecisionBook, markdown: string) {
  const expected = new Map(book.entries.map((entry) => [entry.id, entry]));
  const blocks = [...markdown.matchAll(/<!-- 原文开始 (\S+) sha256:([a-f0-9]+) -->\n([\s\S]*?)\n<!-- 原文结束 \1 -->/g)];
  if (blocks.length !== expected.size) throw new Error('选公司书稿的原文条数不一致');
  for (const [, id, hash, body] of blocks) {
    const entry = expected.get(id);
    if (!entry || body !== entry.body || sourceBookHash(body) !== hash) throw new Error(`选公司书稿原文被改变或重复：${id}`);
    expected.delete(id);
  }
  if (expected.size) throw new Error('选公司书稿存在原文遗漏');
}
