import { describe, expect, it } from 'vitest';
import {
  assembleQaBook,
  getQaChapterNavigation,
  groupQaQuestionsByYear,
  isQaBookMarkdownCurrent,
  loadQaManifest,
  qaQuestionNumber,
  questionUrl,
  renderQaBookMarkdownFromBook,
  type QaQuestionInput,
  type QaSource,
} from './qa-book';

const manifest = loadQaManifest();

const sources: QaSource[] = [
  {
    id: 'meeting-source',
    year: 2001,
    type: 'annual-meeting',
    localSlug: '2001-meeting',
    localCategory: '股东大会',
    internalUrl: '/sources/meetings/2001-meeting',
    titleZh: '2001年伯克希尔股东大会',
    englishUrl: 'https://example.com/meeting',
    provider: 'CNBC Buffett Archive',
    reliability: 'primary',
    translationStatus: 'reviewed',
    completeness: 'full',
  },
  {
    id: 'interview-source',
    year: 2010,
    type: 'reliable-interview',
    localSlug: '2010-interview',
    localCategory: '访谈与文章',
    internalUrl: '/sources/interviews/2010-interview',
    titleZh: '2010年访谈',
    englishUrl: 'https://example.com/interview',
    provider: 'University of Florida',
    reliability: 'primary',
    translationStatus: 'reviewed',
    completeness: 'full',
  },
];

function input(id: string, order: number, sourceId = 'meeting-source'): QaQuestionInput {
  return {
    body: '**沃伦·巴菲特：** 这是回答。',
    data: {
      id,
      title: `问题 ${id}`,
      sourceQuestion: '怎样作出判断？',
      part: 1,
      chapter: 1,
      movement: Math.ceil(order / 6),
      order,
      domain: 'investment',
      sourceId,
      sourceStartAnchor: `${id}-start`,
      sourceEndAnchor: `${id}-end`,
      sourceHash: 'a'.repeat(64),
      externalLocator: { label: '00:01:00' },
      speakers: ['warren-buffett'],
      keywords: ['能力圈'],
      editorialRole: [
        'reader-problem',
        'core-principle',
        'boundary-counterexample',
        'case-action',
        'boundary-counterexample',
        'case-action',
      ][(order - 1) % 6] as QaQuestionInput['data']['editorialRole'],
      chapterBeat: order === 1 ? 'opening' : order === 30 ? 'bridge' : order >= 25 ? 'stress-test' : 'development',
      selectionScore: 8,
      status: 'verified',
    },
  };
}

describe('qa book assembly', () => {
  it('loads the four-part, ten-chapter narrative manifest', () => {
    expect(manifest.parts).toHaveLength(4);
    expect(manifest.chapters).toHaveLength(10);
    expect(manifest.chapters.every((chapter) => chapter.movements.length === 5)).toBe(true);
    expect(manifest.questionCount).toBe(300);
    expect(manifest.chapters.every((chapter) => chapter.questionCount === 30)).toBe(true);
    expect(manifest.chapters.map((chapter) => chapter.shortTitle)).toEqual([
      '能力圈', '企业价值', '买与卖', '市场周期', '风险生存',
      '资本配置', '接班', '投资自己', '人生记分牌', '财富责任',
    ]);
  });

  it('normalizes numeric references and sorts questions by chapter order', () => {
    const book = assembleQaBook(manifest, sources, [input('q002', 2), input('q001', 1)]);
    expect(book.questions.map((question) => question.id)).toEqual(['q001', 'q002']);
    expect(book.questions[0].part.id).toBe('part-1');
    expect(book.questions[0].chapter.id).toBe('chapter-1');
    expect(book.questions[0].movement.id).toBe('movement-1');
    expect(book.questions[0].domain).toBe('investment-business');
    expect(book.chapters[0].questions).toHaveLength(2);
    expect(questionUrl(book.questions[0])).toBe('/books/buffett-wenda-lu/neng-li-quan/#q001');
  });

  it('groups the year index newest first', () => {
    const book = assembleQaBook(manifest, sources, [
      input('q001', 1, 'meeting-source'),
      input('q002', 2, 'interview-source'),
    ]);
    expect(groupQaQuestionsByYear(book.questions).map((group) => group.year)).toEqual([2010, 2001]);
  });

  it('keeps the citation ID stable while visible numbering follows book order', () => {
    const book = assembleQaBook(manifest, sources, [input('q019', 2), input('q002', 1)]);
    expect(book.questions.map((question) => question.id)).toEqual(['q002', 'q019']);
    expect(book.questions.map(qaQuestionNumber)).toEqual([1, 2]);
    expect(questionUrl(book.questions[1])).toContain('#q019');
  });

  it('numbers the first question of chapter two as 31', () => {
    const chapterTwoInput = input('q031', 1);
    chapterTwoInput.data.chapter = 2;
    const book = assembleQaBook(manifest, sources, [chapterTwoInput]);
    expect(qaQuestionNumber(book.questions[0])).toBe(31);
  });

  it('renders stable headings, anchors, source links, and locator labels', () => {
    const book = assembleQaBook(manifest, sources, [input('q001', 1)]);
    const first = renderQaBookMarkdownFromBook(book, 'https://buffett.example');
    const second = renderQaBookMarkdownFromBook(book, 'https://buffett.example');
    expect(first).toBe(second);
    expect(first).toContain('# 巴菲特问答录');
    expect(first).toContain('<a id="q001"></a>');
    expect(first).toContain('#### 第 1 问');
    expect(first).toContain('https://buffett.example/sources/meetings/2001-meeting#q001-start');
    expect(first).toContain('[英文核验来源](https://example.com/meeting)（00:01:00）');
    expect(first).toContain('版本：已核验');
    expect(isQaBookMarkdownCurrent(first, book, 'https://buffett.example')).toBe(true);
    expect(isQaBookMarkdownCurrent(`${first}\n`, book, 'https://buffett.example')).toBe(false);

    const interview = renderQaBookMarkdownFromBook(
      assembleQaBook(manifest, sources, [input('q001', 1, 'interview-source')]),
    );
    expect(interview).toContain('来源：2010 · 佛罗里达大学');
  });

  it('returns previous and next chapters at both book boundaries', () => {
    const book = assembleQaBook(manifest, sources, []);
    expect(getQaChapterNavigation(book.chapters, 'chapter-1')).toMatchObject({
      previous: null,
      next: { id: 'chapter-2' },
    });
    expect(getQaChapterNavigation(book.chapters, 'chapter-5')).toMatchObject({
      previous: { id: 'chapter-4' },
      next: { id: 'chapter-6' },
    });
    expect(getQaChapterNavigation(book.chapters, 'chapter-10')).toMatchObject({
      previous: { id: 'chapter-9' },
      next: null,
    });
  });

  it('fails clearly when a question references an unknown source', () => {
    expect(() => assembleQaBook(manifest, sources, [input('q001', 1, 'missing')]))
      .toThrow('sources 清单中不存在 missing');
  });
});
