import { describe, expect, it } from 'vitest';
import { validateDecisionEvidence, validateDeliveredDecisionBook, decisionSourceNote, type DecisionBook } from './decision-book';
import { parseBookSource, splitBookSource } from './source-book';

const source = parseBookSource('---\ntitle: "2007 股东信"\nslug: test\ncategory: 致股东信\n---\n第一段，原标点。\n\n第二段原话。\n', 'buffett/berkshire/test.md');
const entries = splitBookSource(source).map((entry) => ({ ...entry, sectionId: 'section', classification: 'reviewed' as const, matchScore: 1, matchMargin: 1 }));
const book = { sources: [source], entries, chapters: [{ id: 'chapter-01' }] } as unknown as DecisionBook;
const excerpt = { sourcePath: source.path, title: '原话', quote: '第一段，原标点。' };
const evidence = { overall: excerpt, stages: [{ id: 'understand', readingChapterIds: ['chapter-01'], excerpts: [excerpt] }] } as DecisionBook['evidence'];

describe('选公司原文书的交付约束', () => {
  it('引文必须为原文件连续文字，不能润色标点或拼接', () => {
    expect(() => validateDecisionEvidence(book, evidence)).not.toThrow();
    expect(() => validateDecisionEvidence(book, { ...evidence, overall: { ...excerpt, quote: '第一段、原标点。' } })).toThrow('连续文字');
    expect(() => validateDecisionEvidence(book, { ...evidence, overall: { ...excerpt, quote: '第一段，原标点。第二段原话。' } })).toThrow('连续文字');
  });
  it('拒绝错误的延伸阅读章节', () => {
    expect(() => validateDecisionEvidence(book, { ...evidence, stages: [{ ...evidence.stages[0], readingChapterIds: ['missing'] }] })).toThrow('未知章节');
  });
  it('从实际交付正文检出文字改写、遗漏与重复', () => {
    const entry = entries[0];
    const block = `<!-- 原文开始 ${entry.id} sha256:${entry.hash} -->\n${entry.body}\n<!-- 原文结束 ${entry.id} -->`;
    expect(() => validateDeliveredDecisionBook(book, block)).not.toThrow();
    expect(() => validateDeliveredDecisionBook(book, block.replace('原标点', '改写'))).toThrow('被改变');
    expect(() => validateDeliveredDecisionBook(book, '')).toThrow('条数');
    expect(() => validateDeliveredDecisionBook(book, block + block)).toThrow('条数');
  });
  it('对署名有误的阿贝尔来信添加外部说明，不改正文', () => {
    expect(decisionSourceNote({ slug: '2026-a-bei-er-zhi-gu-dong-xin' })).toContain('作者为格雷格·阿贝尔');
    expect(decisionSourceNote({ slug: '2007-ba-fei-te-zhi-gu-dong-xin' })).toBeUndefined();
  });
});
