import { expect, it } from 'vitest';
import { parseBookSource, splitBookSource } from './source-book';
import { renderSourceEntry, sourceEntryDisplayTitle, sourceEntryRepeatsHeading } from './source-book-render';

it('展示保留表格、跨节参考链接和图片，且不改写原始正文', async () => {
  const source = parseBookSource('---\ntitle: "2000测试"\nslug: test-render\ncategory: 股东大会\n---\n### 1、问题\n\n| 年份 | 收益 |\n| --- | --- |\n| 2000 | 10 |\n\n[资料][ref]\n\n![](/content/buffett/shareholders/images/a.png)\n\n### 2、其他\n\n[ref]: https://example.com\n', 'render-fixture.md');
  const entry = { ...splitBookSource(source)[0], sectionId: 'a', matchScore: 1, matchMargin: 1, classification: 'rule' as const };
  const before = entry.body;
  const html = await renderSourceEntry(entry);
  expect(html).toContain('<table>');
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('src="/images/a.png"');
  expect(entry.body).toBe(before);
});

it('清理重复的编排标题但保留原稿标题与尖括号姓名', async () => {
  const source = parseBookSource('---\ntitle: 资料\nslug: names\ncategory: 访谈与文章\n---\n### 27、慈善责任\n\n> <Eli Broad>，慈善事业。\n', 'name-render-fixture.md');
  const entry = { ...splitBookSource(source)[0], title: '27、慈善责任', sectionId: 'a', matchScore: 1, matchMargin: 1, classification: 'rule' as const };
  expect(sourceEntryDisplayTitle(entry.title)).toBe('慈善责任');
  expect(sourceEntryRepeatsHeading(entry)).toBe(true);
  const rendered = await renderSourceEntry(entry);
  expect(rendered).toContain('27、慈善责任');
  expect(rendered).toContain('&#x3C;Eli Broad>');
  expect(entry.body).toContain('<Eli Broad>');
});

it('相邻问答锚点共用一个 Markdown 段落时，仍只渲染本条范围', async () => {
  const source = parseBookSource('---\ntitle: "2000测试"\nslug: anchors\ncategory: 股东大会\n---\n<a id="qa-source-q001-start"></a>\n\n### 1、第一问\n\n第一答。\n\n<a id="qa-source-q001-end"></a>\n<a id="qa-source-q002-start"></a>\n\n### 2、第二问\n\n第二答。\n\n<a id="qa-source-q002-end"></a>\n', 'anchor-render-fixture.md');
  const entries = splitBookSource(source).map((entry) => ({ ...entry, sectionId: 'a', matchScore: 1, matchMargin: 1, classification: 'rule' as const }));
  expect(entries).toHaveLength(2);
  const [first, second] = await Promise.all(entries.map(renderSourceEntry));
  expect(first).not.toContain('qa-source-q002-start');
  expect(second).toContain('qa-source-q002-start');
  expect(second).toContain('第二答。');
  expect(first).toContain('第一答。');
});
