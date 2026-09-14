import { createHash } from 'node:crypto';
import { QA_INTERVIEW_PROVIDERS, type QaBook, type QaBookManifest, type QaQuestion, type QaSource, type QaSourceType } from './qa-book';

export interface QaValidationOptions {
  allowPendingHashes?: boolean;
}

export interface QaSourceDocument {
  path: string;
  text: string;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const QUESTION_COUNT = 300;
const QUESTIONS_PER_CHAPTER = 30;
const QUESTIONS_PER_MOVEMENT = 6;
const EDITORIAL_ROLE_SEQUENCE = [
  'reader-problem',
  'core-principle',
  'boundary-counterexample',
  'case-action',
  'boundary-counterexample',
  'case-action',
] as const;
const MAIN_SPEAKERS = new Set(['warren-buffett', '巴菲特', '沃伦·巴菲特']);
const ANSWER_START_RE = /^(?:\*\*(?:沃伦·)?巴菲特[：:]\*\*|##\s+(?:沃伦·)?巴菲特(?:[：:]|\s*$))/;
const SPEAKER_NAMES: Record<string, string> = {
  '沃伦·巴菲特': 'warren-buffett',
  '巴菲特': 'warren-buffett',
  '查理·芒格': 'charlie-munger',
  '芒格': 'charlie-munger',
  '格雷格·阿贝尔': 'greg-abel',
  '阿贝尔': 'greg-abel',
  '阿吉特·贾因': 'ajit-jain',
  '阿吉特·贾恩': 'ajit-jain',
  '贾因': 'ajit-jain',
};

function duplicates<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function nonWhitespaceLength(value: string): number {
  return value.replace(/\s/g, '').length;
}

function normalizeSpeaker(value: string): string {
  const name = value.replace(/[：:]$/, '').trim();
  return SPEAKER_NAMES[name] ?? name;
}

export function extractQaBodySpeakers(body: string): string[] {
  const speakers = [...body.matchAll(
    /(?:^|\n)(?:\*\*([^*\n]+?)[：:]\*\*|##\s+([^\n：:]+)[：:]?\s*$)/gm,
  )].map((match) => normalizeSpeaker(match[1] ?? match[2]));
  return [...new Set(speakers)];
}

export function validateQaManifest(manifest: QaBookManifest): string[] {
  const errors: string[] = [];
  if (manifest.parts.length !== 4) errors.push(`manifest: 应有 4 篇，实际 ${manifest.parts.length}`);
  if (manifest.chapters.length !== 10) errors.push(`manifest: 应有 10 章，实际 ${manifest.chapters.length}`);
  if (manifest.questionCount !== QUESTION_COUNT) errors.push(`manifest: questionCount 应为 ${QUESTION_COUNT}`);
  if (manifest.domains['investment-business'] !== 210 || manifest.domains['life-society'] !== 90) {
    errors.push('manifest: 领域配额必须为 investment-business=210、life-society=90');
  }
  if (manifest.sourceQuotas['annual-meeting'] !== 218 || manifest.sourceQuotas['reliable-interview'] !== 82) {
    errors.push('manifest: 来源配额必须为 annual-meeting=218、reliable-interview=82');
  }
  if (manifest.selectionRubric.scale !== 10 || manifest.selectionRubric.minimumScore !== 7) {
    errors.push('manifest: 选编评分必须采用十分制且门槛为 7 分');
  }
  if (manifest.selectionRubric.criteria.join('|') !== '真实性|长期价值|信息密度|独特性|独立可读性') {
    errors.push('manifest: 选编评分维度不完整');
  }

  for (const value of duplicates(manifest.parts.map((part) => part.id))) {
    errors.push(`manifest: 重复篇 ID ${value}`);
  }
  for (const value of duplicates(manifest.chapters.map((chapter) => chapter.id))) {
    errors.push(`manifest: 重复章 ID ${value}`);
  }
  for (const value of duplicates(manifest.chapters.map((chapter) => chapter.slug))) {
    errors.push(`manifest: 重复章 slug ${value}`);
  }
  const partOrders = manifest.parts.map((part) => part.order).sort((a, b) => a - b);
  if (partOrders.join(',') !== '1,2,3,4') errors.push('manifest: 篇 order 必须为 1–4');
  const chapterOrders = manifest.chapters.map((chapter) => chapter.order).sort((a, b) => a - b);
  if (chapterOrders.join(',') !== '1,2,3,4,5,6,7,8,9,10') errors.push('manifest: 章 order 必须为 1–10');

  const chapterIds = new Set(manifest.chapters.map((chapter) => chapter.id));
  const referencedChapters = manifest.parts.flatMap((part) => part.chapterIds);
  for (const chapterId of referencedChapters) {
    if (!chapterIds.has(chapterId)) errors.push(`manifest: 篇目录引用未知章节 ${chapterId}`);
  }
  for (const value of duplicates(referencedChapters)) errors.push(`manifest: 章节 ${value} 被多个篇引用`);
  if (referencedChapters.length !== manifest.chapters.length) {
    errors.push('manifest: 每章必须且只能出现在一个篇目录中');
  }

  const chapterQuota = { 'annual-meeting': 0, 'reliable-interview': 0 };
  const domainQuota = { 'investment-business': 0, 'life-society': 0 };
  for (const chapter of manifest.chapters) {
    if (chapter.questionCount !== QUESTIONS_PER_CHAPTER) {
      errors.push(`${chapter.id}: questionCount 应为 ${QUESTIONS_PER_CHAPTER}`);
    }
    if (chapter.movements.length !== 5) errors.push(`${chapter.id}: 应有 5 节`);
    if (chapter.sourceQuota['annual-meeting'] + chapter.sourceQuota['reliable-interview'] !== QUESTIONS_PER_CHAPTER) {
      errors.push(`${chapter.id}: 来源配额之和应为 ${QUESTIONS_PER_CHAPTER}`);
    }
    chapterQuota['annual-meeting'] += chapter.sourceQuota['annual-meeting'];
    chapterQuota['reliable-interview'] += chapter.sourceQuota['reliable-interview'];
    domainQuota[chapter.domain] += chapter.questionCount;
    const movementOrders = chapter.movements.map((movement) => movement.order).sort((a, b) => a - b);
    if (movementOrders.join(',') !== '1,2,3,4,5') errors.push(`${chapter.id}: movement order 必须为 1–5`);
    if (duplicates(chapter.movements.map((movement) => movement.id)).length) {
      errors.push(`${chapter.id}: movement ID 必须唯一`);
    }
    if (nonWhitespaceLength(chapter.introduction) < 120 || nonWhitespaceLength(chapter.introduction) > 180) {
      errors.push(`${chapter.id}: 编者导读应为 120–180 字`);
    }
    if (!chapter.closing.trim() || nonWhitespaceLength(chapter.closing) > 100) {
      errors.push(`${chapter.id}: 编者过桥应为 1–100 字`);
    }
  }
  if (chapterQuota['annual-meeting'] !== 218 || chapterQuota['reliable-interview'] !== 82) {
    errors.push('manifest: 各章来源配额合计必须为 218/82');
  }
  if (domainQuota['investment-business'] !== 210 || domainQuota['life-society'] !== 90) {
    errors.push('manifest: 各章领域配额合计必须为 210/90');
  }
  return errors;
}

export function validateQaSources(sources: QaSource[]): string[] {
  const errors: string[] = [];
  for (const id of duplicates(sources.map((source) => source.id))) errors.push(`sources: 重复 ID ${id}`);
  for (const source of sources) {
    const prefix = `sources:${source.id || '(missing-id)'}`;
    if (!source.id) errors.push(`${prefix}: 缺少 id`);
    if (!Number.isInteger(source.year)) errors.push(`${prefix}: year 必须是整数`);
    if (source.year === 2026) errors.push(`${prefix}: 禁止使用 2026 年来源`);
    if (!['annual-meeting', 'reliable-interview'].includes(source.type)) errors.push(`${prefix}: 非法 type`);
    if (source.type === 'annual-meeting' && (source.year < 1994 || source.year > 2025)) {
      errors.push(`${prefix}: 年会年份必须在 1994–2025`);
    }
    if (!source.localSlug) errors.push(`${prefix}: 缺少 localSlug/sourcePath`);
    if (!source.titleZh) errors.push(`${prefix}: 缺少中文标题`);
    if (source.type === 'reliable-interview' && !QA_INTERVIEW_PROVIDERS.includes(source.provider as any)) {
      errors.push(`${prefix}: provider 不在可靠访谈白名单（${source.provider || 'missing'}）`);
    }
    if (!isUrl(source.englishUrl)) errors.push(`${prefix}: 缺少有效英文来源 URL`);
    if (!source.reliability) errors.push(`${prefix}: 缺少 reliability`);
    if (!source.translationStatus) errors.push(`${prefix}: 缺少 translationStatus/translation`);
    if (!source.completeness) errors.push(`${prefix}: 缺少 completeness`);
  }
  return errors;
}

function validateQuestion(question: QaQuestion, options: QaValidationOptions): string[] {
  const errors: string[] = [];
  const prefix = question.id;
  if (!/^q\d{3}$/.test(question.id)) errors.push(`${prefix}: id 必须为 qNNN`);
  if (!question.title.trim()) errors.push(`${prefix}: 缺少 title`);
  else if (!/[？?]$/.test(question.title.trim())) errors.push(`${prefix}: title 必须以问号结尾`);
  if (!question.sourceQuestion.trim()) errors.push(`${prefix}: 缺少 sourceQuestion`);
  else if (!/[？?]/.test(question.sourceQuestion)) errors.push(`${prefix}: sourceQuestion 必须包含问号`);
  if (!Number.isInteger(question.order) || question.order < 1 || question.order > QUESTIONS_PER_CHAPTER) {
    errors.push(`${prefix}: order 必须为 1–${QUESTIONS_PER_CHAPTER} 的整数`);
  }
  const expectedRole = EDITORIAL_ROLE_SEQUENCE[(question.order - 1) % QUESTIONS_PER_MOVEMENT];
  if (question.editorialRole !== expectedRole) {
    errors.push(`${prefix}: editorialRole 应为 ${expectedRole}`);
  }
  const expectedBeat = question.order === 1
    ? 'opening'
    : question.order === QUESTIONS_PER_CHAPTER
      ? 'bridge'
      : question.order >= 25
        ? 'stress-test'
        : 'development';
  if (question.chapterBeat !== expectedBeat) {
    errors.push(`${prefix}: chapterBeat 应为 ${expectedBeat}`);
  }
  if (question.domain !== question.chapter.domain) errors.push(`${prefix}: domain 与章节不一致`);
  if (!question.sourceStartAnchor.trim() || !question.sourceEndAnchor.trim()) {
    errors.push(`${prefix}: 缺少原文起止锚点`);
  } else if (question.sourceStartAnchor === question.sourceEndAnchor) {
    errors.push(`${prefix}: 起止锚点不能相同`);
  }
  if (question.sourceHash === 'PENDING') {
    if (!options.allowPendingHashes) errors.push(`${prefix}: sourceHash 尚未生成`);
  } else if (!SHA256_RE.test(question.sourceHash)) {
    errors.push(`${prefix}: sourceHash 必须是 SHA-256 十六进制摘要`);
  }
  if (!question.externalLocator.url && !question.externalLocator.label) {
    errors.push(`${prefix}: externalLocator 缺少定位信息`);
  }
  if (question.externalLocator.url && !isUrl(question.externalLocator.url)) {
    errors.push(`${prefix}: externalLocator.url 不是有效 URL`);
  }
  if (!question.speakers.length) errors.push(`${prefix}: speakers 不能为空`);
  else if (!MAIN_SPEAKERS.has(question.speakers[0])) errors.push(`${prefix}: 巴菲特必须是第一主答者`);
  const declaredSpeakers = [...new Set(question.speakers.map(normalizeSpeaker))].sort();
  const bodySpeakers = extractQaBodySpeakers(question.body).sort();
  if (declaredSpeakers.join('|') !== bodySpeakers.join('|')) {
    errors.push(`${prefix}: speakers 与正文署名不一致（声明 ${declaredSpeakers.join('、')}；正文 ${bodySpeakers.join('、')}）`);
  }
  if (!question.keywords.length) errors.push(`${prefix}: keywords 不能为空`);
  if (!Number.isFinite(question.selectionScore) || question.selectionScore < 7 || question.selectionScore > 10) {
    errors.push(`${prefix}: selectionScore 必须在 7–10 分之间`);
  }
  if (!['verified', 'published'].includes(question.status)) errors.push(`${prefix}: status 必须达到 verified`);
  if (!ANSWER_START_RE.test(question.body.trim())) errors.push(`${prefix}: 正文必须从巴菲特署名开始`);
  return errors;
}

/** Registry parsing stays outside the validator so this rule remains straightforward to unit test. */
export function validateQaKeywordRegistry(book: QaBook, registrySlugs: Set<string>): string[] {
  const errors: string[] = [];
  for (const question of book.questions) {
    for (const keyword of question.keywords) {
      if (!registrySlugs.has(keyword)) errors.push(`${question.id}: 未注册的 keyword slug ${keyword}`);
    }
  }
  return errors;
}

export function validateQaBook(book: QaBook, options: QaValidationOptions = {}): string[] {
  const errors = [
    ...validateQaManifest(book.manifest),
    ...validateQaSources(book.sources),
  ];
  if (book.questions.length !== QUESTION_COUNT) {
    errors.push(`questions: 应有 ${QUESTION_COUNT} 问，实际 ${book.questions.length}`);
  }

  for (const id of duplicates(book.questions.map((question) => question.id))) {
    errors.push(`questions: 重复 ID ${id}`);
  }
  for (const anchor of duplicates(book.questions.map((question) => `${question.sourceId}:${question.sourceStartAnchor}`))) {
    errors.push(`questions: 重复起始锚点 ${anchor}`);
  }
  for (const anchor of duplicates(book.questions.map((question) => `${question.sourceId}:${question.sourceEndAnchor}`))) {
    errors.push(`questions: 重复结束锚点 ${anchor}`);
  }
  const ids = book.questions.map((question) => question.id).sort();
  const expectedIds = Array.from({ length: QUESTION_COUNT }, (_, index) => `q${String(index + 1).padStart(3, '0')}`);
  if (ids.join(',') !== expectedIds.join(',')) errors.push('questions: ID 必须从 q001 连续到 q300');

  const domains = { 'investment-business': 0, 'life-society': 0 };
  const sourceTypes: Record<QaSourceType, number> = { 'annual-meeting': 0, 'reliable-interview': 0 };
  for (const question of book.questions) {
    errors.push(...validateQuestion(question, options));
    domains[question.domain] += 1;
    sourceTypes[question.source.type] += 1;
  }
  if (domains['investment-business'] !== 210 || domains['life-society'] !== 90) {
    errors.push(`questions: 领域数量应为 210/90，实际 ${domains['investment-business']}/${domains['life-society']}`);
  }
  if (sourceTypes['annual-meeting'] !== 218 || sourceTypes['reliable-interview'] !== 82) {
    errors.push(`questions: 来源数量应为 218/82，实际 ${sourceTypes['annual-meeting']}/${sourceTypes['reliable-interview']}`);
  }

  for (const chapter of book.chapters) {
    if (chapter.questions.length !== QUESTIONS_PER_CHAPTER) {
      errors.push(`${chapter.id}: 应有 ${QUESTIONS_PER_CHAPTER} 问，实际 ${chapter.questions.length}`);
    }
    const orders = chapter.questions.map((question) => question.order).sort((a, b) => a - b);
    if (orders.join(',') !== Array.from({ length: QUESTIONS_PER_CHAPTER }, (_, index) => index + 1).join(',')) {
      errors.push(`${chapter.id}: order 必须从 1 连续到 ${QUESTIONS_PER_CHAPTER} 且不重复`);
    }
    const sourceCounts: Record<QaSourceType, number> = { 'annual-meeting': 0, 'reliable-interview': 0 };
    for (const question of chapter.questions) sourceCounts[question.source.type] += 1;
    for (const type of ['annual-meeting', 'reliable-interview'] as const) {
      if (sourceCounts[type] !== chapter.sourceQuota[type]) {
        errors.push(`${chapter.id}: ${type} 应为 ${chapter.sourceQuota[type]} 问，实际 ${sourceCounts[type]}`);
      }
    }
    for (const movement of chapter.movements) {
      const movementQuestions = chapter.questions.filter((question) => question.movement.id === movement.id);
      if (movementQuestions.length !== QUESTIONS_PER_MOVEMENT) {
        errors.push(`${chapter.id}/${movement.id}: 应有 ${QUESTIONS_PER_MOVEMENT} 问，实际 ${movementQuestions.length}`);
      }
      for (const question of movementQuestions) {
        const expectedMovementOrder = Math.ceil(question.order / QUESTIONS_PER_MOVEMENT);
        if (movement.order !== expectedMovementOrder) {
          errors.push(`${question.id}: order ${question.order} 应属于 movement-${expectedMovementOrder}`);
        }
      }
    }
  }
  return errors;
}

export function normalizeAnchoredSourceText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function anchorPattern(anchor: string): RegExp {
  const escaped = escapeRegExp(anchor);
  return new RegExp(`(?:<!--\\s*${escaped}\\s*-->|<a\\s+(?:id|name)=["']${escaped}["']\\s*><\\/a>)`, 'i');
}

function navigableAnchorPattern(anchor: string): RegExp {
  const escaped = escapeRegExp(anchor);
  return new RegExp(`<a\\s+(?:id|name)=["']${escaped}["']\\s*><\\/a>`, 'i');
}

export function extractAnchoredSourceText(text: string, startAnchor: string, endAnchor: string): string | null {
  const start = anchorPattern(startAnchor).exec(text);
  if (!start) return null;
  const afterStart = start.index + start[0].length;
  const tail = text.slice(afterStart);
  const end = anchorPattern(endAnchor).exec(tail);
  if (!end) return null;
  return normalizeAnchoredSourceText(tail.slice(0, end.index));
}

export function hashQaSourceText(text: string): string {
  return createHash('sha256').update(normalizeAnchoredSourceText(text), 'utf8').digest('hex');
}

/** Validate source anchors and their stored SHA-256 without performing file I/O. */
export function validateQaSourceDocuments(
  book: QaBook,
  documents: Map<string, QaSourceDocument>,
): string[] {
  const errors: string[] = [];
  for (const question of book.questions) {
    const document = documents.get(question.source.id);
    if (!document) {
      errors.push(`${question.id}: 无法读取来源 ${question.source.id}`);
      continue;
    }
    const excerpt = extractAnchoredSourceText(
      document.text,
      question.sourceStartAnchor,
      question.sourceEndAnchor,
    );
    if (!navigableAnchorPattern(question.sourceStartAnchor).test(document.text)) {
      errors.push(`${question.id}: 起始锚点必须是可导航的 HTML <a> 锚点（${document.path}）`);
    }
    if (!navigableAnchorPattern(question.sourceEndAnchor).test(document.text)) {
      errors.push(`${question.id}: 结束锚点必须是可导航的 HTML <a> 锚点（${document.path}）`);
    }
    if (excerpt === null) {
      errors.push(`${question.id}: ${document.path} 中找不到完整起止锚点`);
      continue;
    }
    if (!excerpt) {
      errors.push(`${question.id}: 原文锚点之间没有内容`);
      continue;
    }
    if (SHA256_RE.test(question.sourceHash) && hashQaSourceText(excerpt) !== question.sourceHash) {
      errors.push(`${question.id}: sourceHash 与原文锚点内容不一致`);
    }
  }
  return errors;
}
