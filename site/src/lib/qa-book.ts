import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type QaDomain = 'investment-business' | 'life-society';
export type QaSourceType = 'annual-meeting' | 'reliable-interview';
export type QaStatus = 'draft' | 'reviewed' | 'verified' | 'published';
export type QaEditorialRole = 'reader-problem' | 'core-principle' | 'boundary-counterexample' | 'case-action';
export type QaChapterBeat = 'opening' | 'development' | 'stress-test' | 'bridge';
export const QA_INTERVIEW_PROVIDERS = [
  'Charlie Rose',
  'FCIC',
  'PBS',
  'Yahoo Finance',
  'CNBC',
  'Columbia',
  'Money World',
  'University of Florida',
  'University of Georgia',
  'ASU',
] as const;
export type QaInterviewProvider = typeof QA_INTERVIEW_PROVIDERS[number];

export interface QaMovement {
  id: string;
  slug: string;
  title: string;
  order: number;
}

export interface QaManifestPart {
  id: string;
  slug: string;
  title: string;
  order: number;
  chapterIds: string[];
}

export interface QaManifestChapter {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  shortTitle: string;
  part: string;
  domain: QaDomain;
  order: number;
  questionCount: number;
  sourceQuota: Record<QaSourceType, number>;
  introduction: string;
  closing: string;
  movements: QaMovement[];
}

export interface QaBookManifest {
  slug: string;
  title: string;
  subtitle: string;
  version: number;
  questionCount: number;
  domains: Record<QaDomain, number>;
  sourceQuotas: Record<QaSourceType, number>;
  selectionRubric: {
    scale: number;
    minimumScore: number;
    criteria: string[];
  };
  parts: QaManifestPart[];
  chapters: QaManifestChapter[];
}

export interface QaExternalLocator {
  url?: string;
  label?: string;
  year?: number;
}

export interface QaSource {
  id: string;
  year: number;
  date?: string;
  type: QaSourceType;
  localSlug: string;
  localCategory: '股东大会' | '访谈与文章';
  sourcePath?: string;
  internalUrl: string;
  titleZh: string;
  englishTitle?: string;
  englishUrl: string;
  provider: QaInterviewProvider | 'CNBC Buffett Archive' | string;
  reliability: string;
  translationStatus: string;
  completeness: string;
}

export interface QaQuestionInput {
  filePath?: string;
  body: string;
  data: {
    id: string;
    title: string;
    sourceQuestion: string;
    part: string | number;
    chapter: string | number;
    movement: string | number;
    order: number;
    domain: QaDomain | 'investment' | 'life';
    sourceId: string;
    sourceStartAnchor: string;
    sourceEndAnchor: string;
    sourceHash: string;
    externalLocator: string | QaExternalLocator;
    speakers: string[];
    keywords: string[];
    editorialRole: QaEditorialRole;
    chapterBeat: QaChapterBeat;
    selectionScore: number;
    status: QaStatus;
  };
}

export interface QaQuestion {
  filePath?: string;
  body: string;
  id: string;
  title: string;
  sourceQuestion: string;
  part: QaManifestPart;
  chapter: QaManifestChapter;
  movement: QaMovement;
  order: number;
  domain: QaDomain;
  sourceId: string;
  source: QaSource;
  sourceStartAnchor: string;
  sourceEndAnchor: string;
  sourceHash: string;
  externalLocator: QaExternalLocator;
  speakers: string[];
  keywords: string[];
  editorialRole: QaEditorialRole;
  chapterBeat: QaChapterBeat;
  selectionScore: number;
  status: QaStatus;
}

export interface QaBookChapter extends Omit<QaManifestChapter, 'part'> {
  part: QaManifestPart;
  questions: QaQuestion[];
}

export interface QaBookPart extends QaManifestPart {
  chapters: QaBookChapter[];
}

export interface QaBook {
  manifest: QaBookManifest;
  parts: QaBookPart[];
  chapters: QaBookChapter[];
  sources: QaSource[];
  questions: QaQuestion[];
}

export interface QaYearGroup {
  year: number;
  questions: QaQuestion[];
}

export interface QaChapterNavigation {
  previous: QaBookChapter | null;
  next: QaBookChapter | null;
}

const BOOK_ROOT = fileURLToPath(
  new URL('../../../buffett/books/buffett-wenda-lu/', import.meta.url),
);
const MANIFEST_PATH = `${BOOK_ROOT}manifest.json`;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取问答录数据 ${path}: ${detail}`);
  }
}

export function loadQaManifest(path = MANIFEST_PATH): QaBookManifest {
  return readJson(path) as QaBookManifest;
}

function sourceSlugFromPath(path = ''): string {
  return path.split('/').at(-1)?.replace(/\.md$/, '') ?? '';
}

function normalizeProvider(value: unknown, type: QaSourceType): string {
  if (type === 'annual-meeting') return String(value ?? 'CNBC Buffett Archive');
  const provider = String(value ?? '').trim();
  const key = provider.toLowerCase();
  const aliases: Record<string, QaInterviewProvider> = {
    'charlie rose': 'Charlie Rose',
    'fcic': 'FCIC',
    'financial crisis inquiry commission': 'FCIC',
    'pbs': 'PBS',
    'yahoo finance': 'Yahoo Finance',
    'cnbc': 'CNBC',
    'columbia': 'Columbia',
    'columbia business school': 'Columbia',
    'money world': 'Money World',
    'university of florida': 'University of Florida',
    'university of georgia': 'University of Georgia',
    'asu': 'ASU',
    'arizona state university': 'ASU',
  };
  return aliases[key] ?? provider;
}

function normalizeSource(raw: Record<string, unknown>): QaSource {
  const type = raw.type === 'annual-meeting' ? 'annual-meeting' : 'reliable-interview';
  const date = typeof raw.date === 'string' ? raw.date : undefined;
  const yearFromDate = Number(date?.slice(0, 4));
  const year = Number(raw.year ?? yearFromDate);
  const sourcePath = typeof raw.sourcePath === 'string' ? raw.sourcePath : undefined;
  const localSlug = String(raw.localSlug ?? sourceSlugFromPath(sourcePath));
  const localCategory = type === 'annual-meeting' ? '股东大会' : '访谈与文章';
  const group = type === 'annual-meeting' ? 'meetings' : 'interviews';

  return {
    id: String(raw.id ?? ''),
    year,
    date,
    type,
    localSlug,
    localCategory,
    sourcePath,
    internalUrl: localSlug ? `/sources/${group}/${localSlug}` : '',
    titleZh: String(raw.titleZh ?? raw.title ?? ''),
    englishTitle: typeof raw.englishTitle === 'string' ? raw.englishTitle : undefined,
    englishUrl: String(raw.englishUrl ?? raw.externalUrl ?? ''),
    provider: normalizeProvider(raw.provider, type),
    reliability: String(raw.reliability ?? ''),
    translationStatus: String(raw.translationStatus ?? raw.translation ?? ''),
    completeness: String(raw.completeness ?? ''),
  };
}

function sourceEntries(value: unknown, path: string): Record<string, unknown>[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { sources?: unknown }).sources)
      ? (value as { sources: unknown[] }).sources
      : null;
  if (!entries) throw new Error(`${path}: 来源清单必须是数组或 { "sources": [...] }`);
  return entries as Record<string, unknown>[];
}

/**
 * 优先读取合并后的 sources.json；内容并行整理期间，也可直接合并两份 split 清单。
 * 如果三份文件都不存在则返回空数组，随后装配含问题的数据时会给出具体缺失 sourceId。
 */
export function loadQaSources(bookRoot = BOOK_ROOT): QaSource[] {
  const mergedPath = `${bookRoot}sources.json`;
  const splitPaths = [
    `${bookRoot}sources-meetings.json`,
    `${bookRoot}sources-interviews.json`,
  ];
  const paths = existsSync(mergedPath) ? [mergedPath] : splitPaths.filter(existsSync);
  if (!paths.length) return [];

  return paths
    .flatMap((path) => sourceEntries(readJson(path), path))
    .map(normalizeSource)
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
}

function ordinalId(value: string | number, prefix: 'part' | 'chapter' | 'movement'): string {
  if (typeof value === 'number') return `${prefix}-${value}`;
  if (/^\d+$/.test(value)) return `${prefix}-${value}`;
  return value;
}

function normalizeDomain(value: QaQuestionInput['data']['domain']): QaDomain {
  return value === 'investment' ? 'investment-business'
    : value === 'life' ? 'life-society'
      : value;
}

function normalizeExternalLocator(value: QaQuestionInput['data']['externalLocator']): QaExternalLocator {
  return typeof value === 'string' ? { label: value } : value;
}

/** Assemble and cross-link manifest, sources, and raw collection entries. */
export function assembleQaBook(
  manifest: QaBookManifest,
  sources: QaSource[],
  inputs: QaQuestionInput[],
): QaBook {
  const partById = new Map(manifest.parts.map((part) => [part.id, part]));
  const chapterById = new Map(manifest.chapters.map((chapter) => [chapter.id, chapter]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const questions = inputs.map(({ data, body, filePath }): QaQuestion => {
    const partId = ordinalId(data.part, 'part');
    const chapterId = ordinalId(data.chapter, 'chapter');
    const movementId = ordinalId(data.movement, 'movement');
    const part = partById.get(partId);
    const chapter = chapterById.get(chapterId);
    const movement = chapter?.movements.find((item) => item.id === movementId);
    const source = sourceById.get(data.sourceId);
    const location = filePath ? ` (${filePath})` : '';

    if (!part) throw new Error(`${data.id}${location}: manifest 中不存在 ${partId}`);
    if (!chapter) throw new Error(`${data.id}${location}: manifest 中不存在 ${chapterId}`);
    if (chapter.part !== part.id) {
      throw new Error(`${data.id}${location}: ${chapter.id} 不属于 ${part.id}`);
    }
    if (!movement) throw new Error(`${data.id}${location}: ${chapter.id} 中不存在 ${movementId}`);
    if (!source) throw new Error(`${data.id}${location}: sources 清单中不存在 ${data.sourceId}`);

    return {
      ...data,
      filePath,
      body: body.trim(),
      part,
      chapter,
      movement,
      domain: normalizeDomain(data.domain),
      source,
      externalLocator: normalizeExternalLocator(data.externalLocator),
    };
  }).sort((a, b) => a.chapter.order - b.chapter.order || a.order - b.order || a.id.localeCompare(b.id));

  const chapters: QaBookChapter[] = manifest.chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((chapter) => ({
      ...chapter,
      part: partById.get(chapter.part)!,
      movements: chapter.movements.slice().sort((a, b) => a.order - b.order),
      questions: questions.filter((question) => question.chapter.id === chapter.id),
    }));

  const parts: QaBookPart[] = manifest.parts
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((part) => ({
      ...part,
      chapters: chapters.filter((chapter) => chapter.part.id === part.id),
    }));

  return { manifest, parts, chapters, sources, questions };
}

let cache: QaBook | null = null;

export async function getQaBook(): Promise<QaBook> {
  if (cache) return cache;
  const { getCollection } = await import('astro:content') as {
    getCollection: (name: string) => Promise<any[]>;
  };
  const entries = await getCollection('qaBookQuestions');
  const inputs = entries.map((entry: any): QaQuestionInput => ({
    filePath: entry.filePath,
    body: entry.body ?? '',
    data: entry.data,
  }));
  cache = assembleQaBook(loadQaManifest(), loadQaSources(), inputs);
  return cache;
}

export async function getQaChapters(): Promise<QaBookChapter[]> {
  return (await getQaBook()).chapters;
}

/** Stable previous/next chapter lookup shared by pages and unit tests. */
export function getQaChapterNavigation(
  chapters: QaBookChapter[],
  chapterId: string,
): QaChapterNavigation {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? chapters[index - 1] : null,
    next: index < chapters.length - 1 ? chapters[index + 1] : null,
  };
}

/** 年份索引按新到旧排列，年内保持全书章序。 */
export function groupQaQuestionsByYear(questions: QaQuestion[]): QaYearGroup[] {
  const byYear = new Map<number, QaQuestion[]>();
  for (const question of questions) {
    const group = byYear.get(question.source.year) ?? [];
    group.push(question);
    byYear.set(question.source.year, group);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => ({ year, questions: items }));
}

export async function getQaQuestionsByYear(): Promise<QaYearGroup[]> {
  return groupQaQuestionsByYear((await getQaBook()).questions);
}

export function questionUrl(question: Pick<QaQuestion, 'id' | 'chapter'>): string {
  return `/books/buffett-wenda-lu/${question.chapter.slug}/#${question.id}`;
}

/**
 * qNNN is a permanent citation anchor. The visible number follows editorial
 * chapter order so questions can move without breaking saved links.
 */
export function qaQuestionNumber(question: Pick<QaQuestion, 'order' | 'chapter'>): number {
  return (question.chapter.order - 1) * question.chapter.questionCount + question.order;
}

function absoluteUrl(path: string, siteUrl?: string): string {
  if (!siteUrl || /^https?:\/\//.test(path)) return path;
  return `${siteUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function speakerName(speaker: string): string {
  const names: Record<string, string> = {
    'warren-buffett': '沃伦·巴菲特',
    'charlie-munger': '查理·芒格',
    'greg-abel': '格雷格·阿贝尔',
    'ajit-jain': '阿吉特·贾恩',
  };
  return names[speaker] ?? speaker;
}

const PROVIDER_LABELS: Record<string, string> = {
  'Charlie Rose': '查理·罗斯',
  FCIC: '美国金融危机调查委员会（FCIC）',
  PBS: 'PBS',
  'Yahoo Finance': '雅虎财经',
  CNBC: 'CNBC',
  Columbia: '哥伦比亚大学',
  'Money World': '《Money World》',
  'University of Florida': '佛罗里达大学',
  'University of Georgia': '佐治亚大学',
  ASU: '亚利桑那州立大学',
};

export function qaSourceVenueLabel(source: Pick<QaSource, 'type' | 'provider'>): string {
  if (source.type === 'annual-meeting') return '伯克希尔股东大会';
  return PROVIDER_LABELS[source.provider] ?? source.provider;
}

export function qaStatusLabel(status: QaStatus): string {
  return {
    draft: '初稿',
    reviewed: '已审校',
    verified: '已核验',
    published: '已发布',
  }[status];
}

function bodyForBook(body: string): string {
  return body
    .replace(/^##\s+(.+)$/gm, (_match, name: string) => `**${name.replace(/[：:]$/, '')}：**`)
    .trim();
}

/** Pure deterministic Markdown renderer, also used by the build script and tests. */
export function renderQaBookMarkdownFromBook(book: QaBook, siteUrl?: string): string {
  const { manifest } = book;
  const lines = [
    '---',
    `title: "${manifest.title}"`,
    `subtitle: "${manifest.subtitle}"`,
    `slug: "${manifest.slug}"`,
    `version: ${manifest.version}`,
    '---',
    '',
    `# ${manifest.title}`,
    '',
    `> ${manifest.subtitle}`,
    '',
    '## 目录',
    '',
  ];

  for (const part of book.parts) {
    lines.push(`### 第${part.order}篇 ${part.title}`, '');
    for (const chapter of part.chapters) {
      lines.push(`${chapter.order}. [${chapter.title}](#chapter-${chapter.order})`);
    }
    lines.push('');
  }

  for (const part of book.parts) {
    lines.push(`# 第${part.order}篇 ${part.title}`, '');
    for (const chapter of part.chapters) {
      lines.push(
        `<a id="chapter-${chapter.order}"></a>`,
        '',
        `## 第${chapter.order}章 ${chapter.title}`,
        '',
        `*${chapter.subtitle}*`,
        '',
        `> **编者导读** ${chapter.introduction}`,
        '',
      );

      for (const movement of chapter.movements) {
        lines.push(`### ${movement.title}`, '');
        const questions = chapter.questions.filter((question) => question.movement.id === movement.id);
        for (const question of questions) {
          const internalSource = absoluteUrl(
            `${question.source.internalUrl}#${question.sourceStartAnchor}`,
            siteUrl,
          );
          const externalSource = question.externalLocator.url ?? question.source.englishUrl;
          const sourceBits = [
            `${question.source.year} · ${qaSourceVenueLabel(question.source)}`,
            `[站内中文原文](${internalSource})`,
          ];
          if (externalSource) {
            const locator = question.externalLocator.label ? `（${question.externalLocator.label}）` : '';
            sourceBits.push(`[英文核验来源](${externalSource})${locator}`);
          }

          lines.push(
            `<a id="${question.id}"></a>`,
            '',
            `#### 第 ${qaQuestionNumber(question)} 问 ${question.title}`,
            '',
            `**原始提问：** ${question.sourceQuestion.trim()}`,
            '',
            bodyForBook(question.body),
            '',
            `*来源：${sourceBits.join(' · ')}*`,
            '',
            `*回答者：${question.speakers.map(speakerName).join('、')} · 版本：${qaStatusLabel(question.status)}*`,
            '',
          );
        }
      }

      lines.push(`> **编者过桥** ${chapter.closing}`, '');
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function isQaBookMarkdownCurrent(current: string, book: QaBook, siteUrl?: string): boolean {
  return current === renderQaBookMarkdownFromBook(book, siteUrl);
}

export async function renderQaBookMarkdown(siteUrl?: string): Promise<string> {
  return renderQaBookMarkdownFromBook(await getQaBook(), siteUrl);
}
