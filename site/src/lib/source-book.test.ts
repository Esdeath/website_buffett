import { describe, expect, it } from 'vitest';
import { parseBookSource, splitBookSource, sourceBookHash, validateSourceBook, applySourceBookEditing, type SourceBook, type SourceBookSection } from './source-book';

const source = (body: string) => parseBookSource(`---\ntitle: "2024年伯克希尔股东大会"\nslug: test\ncategory: 股东大会\n---\n${body}`, 'buffett/shareholders/test.md');

describe('无损原文编排', () => {
  it('保留前言、场次、追问、表格、图片以及原始空白；章节内部小标题不拆回答', () => {
    const body = '# 原文\n\n开场文字。\n\n## 上午场\n\n### 1、怎样估值？\n\n问：怎么做？\n\n#### 回答的例子\n\n| 指标 | 数字 |\n| --- | --- |\n| 利润 | 10 |\n\n![](example.png)\n\n追问：为什么？\n\n### 2、怎样卖出？\n\n回答。\n\n';
    const entries = splitBookSource(source(body));
    expect(entries.map((e) => e.body).join('')).toBe(body);
    expect(entries).toHaveLength(3);
    expect(entries[1].body).toContain('追问：为什么？');
    expect(entries[1].body).toContain('| 利润 | 10 |');
    expect(entries[0].startLine).toBe(6);
  });

  it('保持既有完整问答锚点内跨标题的上下文', () => {
    const body = '# 原文\n\n<a id="qa-source-q030-start"></a>\n\n### 29、倾听\n\n回答一。\n\n### 30、好公司\n\n回答二。\n\n<a id="qa-source-q030-end"></a>\n\n### 31、其他问题\n\n回答三。\n';
    const entries = splitBookSource(source(body));
    expect(entries).toHaveLength(2);
    expect(entries[0].body).toContain('回答二。');
    expect(entries.map((e) => e.body).join('')).toBe(body);
  });

  it('识别没有 Markdown 标题的编号问答，并保留 CRLF 和 Unicode', () => {
    const body = '开场。\r\n\r\n第一问：投资🙂？\r\n\r\n回答。\r\n\r\n第二问：经营？\r\n\r\n回答二。';
    const entries = splitBookSource(source(body));
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.body).join('')).toBe(body);
    expect(entries[1].hash).toBe(sourceBookHash(entries[1].body));
  });

  it('访谈外层重复标题不吞掉更深层的无编号 Q 或中文逗号问题', () => {
    const body = '# 访谈\n\n## 重复的全文标题\n\n#### Q：怎样投资？\n\n回答一。\n\n#### 2，怎样生活？\n\n回答二。\n';
    const original = parseBookSource(`---\ntitle: 访谈\nslug: interview\ncategory: 访谈与文章\n---\n${body}`, 'interview-fixture.md');
    const entries = splitBookSource(original);
    expect(entries).toHaveLength(2);
    expect(entries[0].body).toContain('回答一。');
    expect(entries[0].body).not.toContain('回答二。');
    expect(entries.map((e) => e.body).join('')).toBe(body);
  });

  it('人工话题边界必须唯一并且是完整段落起点', () => {
    const original = source('罗斯：第一个问题。\n\n回答。\n\n罗斯：第二个问题。\n\n回答。');
    expect(splitBookSource(original, [{ startText: '罗斯：第二个问题。', title: '第二个问题' }])).toHaveLength(2);
    expect(() => splitBookSource(original, [{ startText: '不存在', title: '' }])).toThrow('缺失或不唯一');
    expect(() => splitBookSource(original, [{ startText: '第二个问题。', title: '' }])).toThrow('完整段落起点');
    expect(() => splitBookSource(original, [{ startText: '回答。', title: '' }])).toThrow('不唯一');
  });

  it('拒绝文字篡改和目录重复，不能靠更新统计掩盖遗漏', () => {
    const original = source('### 1、问题\n\n答复。');
    const entries = splitBookSource(original).map((e) => ({ ...e, sectionId: 'section', matchScore: 1, matchMargin: 1, classification: 'rule' as const }));
    const book = { entries, sources: [original], parts: [{ chapters: [{ sections: [{ entries }] }] }] } as unknown as SourceBook;
    expect(() => validateSourceBook(book)).not.toThrow();
    entries[0].body = entries[0].body.replace('答复', '改写');
    expect(() => validateSourceBook(book)).toThrow('文字被修改');
    entries[0].body = original.body;
    book.parts[0].chapters[0].sections[0].entries = [entries[0], entries[0]];
    expect(() => validateSourceBook(book)).toThrow('遗漏或重复');
  });

  it('主线重排和附录移位不删改任何原文，并留下延伸材料', () => {
    const original = source('## 1、资料说明\n\n原始资料。\n\n## 2、较早的例子\n\n原始例子。\n\n## 3、概念解释\n\n原始解释。');
    const entries = splitBookSource(original).map((entry) => ({ ...entry, sectionId: 'topic', matchScore: 1, matchMargin: 1, classification: 'rule' as const }));
    const sections = ['topic', 'appendix'].map((id) => ({ id, chapterId: 'chapter', title: id, terms: [], entries: [] })) as SourceBookSection[];
    applySourceBookEditing(entries, sections, new Set(['appendix']), {
      revision: 'test', methodNotes: [], moves: { [entries[0].id]: { sectionId: 'appendix', reason: '资料说明' } },
      sectionLeads: { topic: [{ id: entries[2].id, stage: 'principle', reason: '先解释概念' }] },
    });
    expect(sections[0].entries.map((entry) => entry.id)).toEqual([entries[2].id, entries[1].id]);
    expect(sections[0].entries.map((entry) => entry.readingRole)).toEqual(['core', 'further']);
    expect(sections[1].entries[0].readingRole).toBe('appendix');
    expect(entries.map((entry) => entry.body).join('')).toBe(original.body);
    expect(() => validateSourceBook({ entries, sources: [original], parts: [{ chapters: [{ sections }] }] } as unknown as SourceBook)).not.toThrow();
  });

  it('阻止主线引用其他主题、重复选录或不存在的对照版本', () => {
    const entries = splitBookSource(source('## 1、主题\n\n正文。')).map((entry) => ({ ...entry, sectionId: 'topic', matchScore: 1, matchMargin: 1, classification: 'rule' as const }));
    const sections = ['topic', 'other'].map((id) => ({ id, chapterId: 'chapter', title: id, terms: [], entries: [] })) as SourceBookSection[];
    const lead = { id: entries[0].id, stage: 'principle', reason: '概念' };
    const base = { revision: 'test', methodNotes: [], moves: {} };
    expect(() => applySourceBookEditing(entries, sections, new Set(), { ...base, sectionLeads: { other: [lead] } })).toThrow('不属于本节');
    expect(() => applySourceBookEditing(entries, sections, new Set(), { ...base, sectionLeads: { topic: [lead, lead] } })).toThrow('重复');
    expect(() => applySourceBookEditing(entries, sections, new Set(), { ...base, sectionLeads: {}, moves: { [lead.id]: { sectionId: 'other', reason: '重复', duplicateOf: 'missing' } } })).toThrow('重复版本引用失效');
  });

  it('目录换序时固定既有归属，只有显式复核移位可以覆盖', () => {
    const entries = splitBookSource(source('## 1、保留归属\n\n正文一。\n\n## 2、调整归属\n\n正文二。')).map((entry) => ({ ...entry, sectionId: 'new-first', matchScore: 1, matchMargin: 0, classification: 'rule' as const }));
    const sections = ['new-first', 'previous', 'reviewed'].map((id) => ({ id, chapterId: 'chapter', title: id, terms: [], entries: [] })) as SourceBookSection[];
    applySourceBookEditing(entries, sections, new Set(), {
      revision: 'test', methodNotes: [], sectionLeads: {},
      previousSections: Object.fromEntries(entries.map((entry) => [entry.id, 'previous'])),
      moves: { [entries[1].id]: { sectionId: 'reviewed', reason: '重新核对完整问答' } },
    });
    expect(entries.map((entry) => entry.sectionId)).toEqual(['previous', 'reviewed']);
    expect(sections[0].entries).toHaveLength(0);
  });
});
