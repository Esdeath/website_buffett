import { describe, expect, it } from 'vitest';
import {
  assembleQaBook,
  loadQaManifest,
  type QaBook,
  type QaQuestionInput,
  type QaSource,
} from './qa-book';
import {
  extractAnchoredSourceText,
  hashQaSourceText,
  validateQaBook,
  validateQaKeywordRegistry,
  validateQaManifest,
  validateQaSources,
  validateQaSourceDocuments,
} from './qa-book-validation';

function makeCompleteBook(): QaBook {
  const manifest = structuredClone(loadQaManifest());
  const sources: QaSource[] = [
    {
      id: 'meeting', year: 2000, type: 'annual-meeting', localSlug: 'meeting',
      localCategory: '股东大会', internalUrl: '/sources/meetings/meeting', titleZh: '股东大会',
      englishUrl: 'https://example.com/meeting', reliability: 'primary',
      provider: 'CNBC Buffett Archive',
      translationStatus: 'reviewed', completeness: 'full',
    },
    {
      id: 'interview', year: 2010, type: 'reliable-interview', localSlug: 'interview',
      localCategory: '访谈与文章', internalUrl: '/sources/interviews/interview', titleZh: '访谈',
      englishUrl: 'https://example.com/interview', reliability: 'primary',
      provider: 'CNBC',
      translationStatus: 'reviewed', completeness: 'full',
    },
  ];
  let index = 0;
  const inputs: QaQuestionInput[] = [];
  for (const chapter of manifest.chapters) {
    for (let order = 1; order <= 30; order += 1) {
      index += 1;
      const sourceId = order <= chapter.sourceQuota['annual-meeting'] ? 'meeting' : 'interview';
      inputs.push({
        body: '**沃伦·巴菲特：** 回答。',
        data: {
          id: `q${String(index).padStart(3, '0')}`,
          title: `问题 ${index}？`,
          sourceQuestion: '原始问题？',
          part: chapter.part,
          chapter: chapter.id,
          movement: `movement-${Math.ceil(order / 6)}`,
          order,
          domain: chapter.domain,
          sourceId,
          sourceStartAnchor: `q${index}-start`,
          sourceEndAnchor: `q${index}-end`,
          sourceHash: 'a'.repeat(64),
          externalLocator: { label: `问题 ${index}` },
          speakers: ['warren-buffett'],
          keywords: ['价值投资'],
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
      });
    }
  }
  return assembleQaBook(manifest, sources, inputs);
}

describe('qa book validation', () => {
  it('accepts a complete 300-question fixture', () => {
    expect(validateQaBook(makeCompleteBook())).toEqual([]);
  });

  it('reports structural and editorial failures', () => {
    const book = makeCompleteBook();
    book.questions[0].speakers = ['charlie-munger'];
    book.questions[0].sourceHash = 'PENDING';
    book.questions[0].selectionScore = 6;
    book.questions[0].editorialRole = 'case-action';
    book.questions[0].chapterBeat = 'development';
    book.questions[1].order = 1;
    const errors = validateQaBook(book);
    expect(errors.some((error) => error.includes('巴菲特必须是第一主答者'))).toBe(true);
    expect(errors.some((error) => error.includes('speakers 与正文署名不一致'))).toBe(true);
    expect(errors.some((error) => error.includes('sourceHash 尚未生成'))).toBe(true);
    expect(errors.some((error) => error.includes('selectionScore 必须在 7–10 分之间'))).toBe(true);
    expect(errors.some((error) => error.includes('editorialRole 应为 reader-problem'))).toBe(true);
    expect(errors.some((error) => error.includes('chapterBeat 应为 opening'))).toBe(true);
    expect(errors.some((error) => error.includes('order 必须从 1 连续到 30'))).toBe(true);
  });

  it('requires every keyword to use a registry slug', () => {
    const book = makeCompleteBook();
    expect(validateQaKeywordRegistry(book, new Set(['价值投资']))).toEqual([]);
    expect(validateQaKeywordRegistry(book, new Set())).toContain('q001: 未注册的 keyword slug 价值投资');
  });

  it('rejects 2026 sources and interview providers outside the whitelist', () => {
    const source = structuredClone(makeCompleteBook().sources[1]);
    source.year = 2026;
    source.provider = 'Unknown Channel';
    const errors = validateQaSources([source]);
    expect(errors.some((error) => error.includes('禁止使用 2026 年来源'))).toBe(true);
    expect(errors.some((error) => error.includes('provider 不在可靠访谈白名单'))).toBe(true);
  });

  it('rejects a manifest with the wrong chapter count', () => {
    const manifest = structuredClone(loadQaManifest());
    manifest.chapters.pop();
    expect(validateQaManifest(manifest)).toContain('manifest: 应有 10 章，实际 9');
  });

  it('extracts anchor contents after LF normalization and verifies hashes', () => {
    const raw = 'before\r\n<a id="q1-start"></a>\r\n正文\r\n<a id="q1-end"></a>\r\nafter';
    expect(extractAnchoredSourceText(raw, 'q1-start', 'q1-end')).toBe('正文');
    expect(hashQaSourceText(' 正文\r\n')).toBe(hashQaSourceText('正文'));

    const book = makeCompleteBook();
    const question = book.questions[0];
    const excerpt = '经过核验的原文';
    question.sourceHash = hashQaSourceText(excerpt);
    const docs = new Map([
      ['meeting', {
        path: 'meeting.md',
        text: `<a id="${question.sourceStartAnchor}"></a>\n${excerpt}\n<a id="${question.sourceEndAnchor}"></a>`,
      }],
    ]);
    const errors = validateQaSourceDocuments(
      { ...book, questions: [question] },
      docs,
    );
    expect(errors).toEqual([]);
  });
});
