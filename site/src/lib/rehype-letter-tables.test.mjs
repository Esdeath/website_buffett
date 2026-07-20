import { describe, expect, it } from 'vitest';
import { rehypeLetterTables } from './rehype-letter-tables.mjs';

const text = (value) => ({ type: 'text', value });
const cell = (tagName, value) => ({
  type: 'element',
  tagName,
  properties: {},
  children: typeof value === 'string' ? [text(value)] : value,
});
const row = (tagName, values) => ({
  type: 'element',
  tagName: 'tr',
  properties: {},
  children: values.map((value) => cell(tagName, value)),
});

function fixture(headers, body) {
  const table = {
    type: 'element',
    tagName: 'table',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'thead',
        properties: {},
        children: [row('th', headers)],
      },
      {
        type: 'element',
        tagName: 'tbody',
        properties: {},
        children: body.map((values) => row('td', values)),
      },
    ],
  };

  return {
    tree: { type: 'root', children: [table] },
    table,
  };
}

const transform = (tree, path) => rehypeLetterTables()(tree, { path });
const cells = (table, section) => table.children
  .find((node) => node.tagName === section)
  .children.flatMap((tableRow) => tableRow.children);
const hasNumericClass = (node) => node.properties.className?.includes('letter-table-numeric') ?? false;

describe('rehypeLetterTables', () => {
  it.each([
    '/repo/buffett/berkshire/gu-dong-xin/2024-ba-fei-te-zhi-gu-dong-xin.md',
    'C:\\repo\\buffett\\berkshire\\he-huo-ren-xin\\1964-ba-fei-te-zhi-he-huo-ren-xin.md',
  ])('wraps tables only in letter source paths: %s', (path) => {
    const { tree, table } = fixture(['项目', '金额'], [['现金', '$1,200']]);

    transform(tree, path);

    expect(tree.children).toEqual([
      expect.objectContaining({
        type: 'element',
        tagName: 'div',
        properties: { className: ['letter-table-scroll'] },
        children: [table],
      }),
    ]);
  });

  it.each([
    '/repo/buffett/berkshire/interview/example.md',
    '/repo/buffett/shareholders/2024-meeting.md',
    '/repo/buffett/articles/keywords/example.md',
  ])('leaves non-letter paths unchanged: %s', (path) => {
    const { tree, table } = fixture(['项目', '金额'], [['现金', '$1,200']]);

    transform(tree, path);

    expect(tree.children).toEqual([table]);
    expect(cells(table, 'thead').every((node) => !hasNumericClass(node))).toBe(true);
  });

  it('preserves the native table nesting inside its scroll wrapper', () => {
    const { tree, table } = fixture(['项目', '金额'], [['现金', '$1,200']]);
    const originalChildren = table.children;

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/example.md');

    const wrapper = tree.children[0];
    expect(wrapper.children).toEqual([table]);
    expect(table.children).toBe(originalChildren);
    expect(table.children.map((node) => node.tagName)).toEqual(['thead', 'tbody']);
  });

  it('classifies common financial values and short Chinese annotations as numeric', () => {
    const { tree, table } = fixture(
      ['项目', '金额'],
      [
        ['收入', '$1,234.50'],
        ['回报', '-8.4%'],
        ['亏损', '(2,000)'],
        ['调整', '+45.0%（估算）'],
        ['市值', [
          { type: 'element', tagName: 'strong', properties: {}, children: [text('￥3,500.25')] },
        ]],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/example.md');

    expect(hasNumericClass(cells(table, 'thead')[1])).toBe(true);
    expect(cells(table, 'tbody').filter((_, index) => index % 2 === 1).every(hasNumericClass)).toBe(true);
  });

  it('classifies fixed-income values with repeated numeric footnotes', () => {
    const { tree, table } = fixture(
      ['发行方', '成本', '市值'],
      [
        ['ACF工业', '$ 93,918(2)', '$118,683'],
        ['美国运通', '300,000', '263,265(1)(2)'],
        ['冠军国际', '300,000(2)', '300,000(1)'],
        ['第一帝国', '40,000', '50,000(1)(2)'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/1991-ba-fei-te-zhi-gu-dong-xin.md');

    expect(cells(table, 'thead').map(hasNumericClass)).toEqual([false, true, true]);
  });

  it('classifies leading decimals without treating entity IDs as signed numbers', () => {
    const { tree, table } = fixture(
      ['年份', '经营收益', '每股经营收益', '债券编号'],
      [
        ['1964', '.2', '.15', 'A123'],
        ['未披露', '—', '不适用', 'B456'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/2003-ba-fei-te-zhi-gu-dong-xin.md');

    expect(cells(table, 'thead').map(hasNumericClass)).toEqual([false, true, true, false]);
  });

  it('classifies simple split fractions from the 1961 midyear partner letter', () => {
    const { tree, table } = fixture(
      ['方案', '普通合伙人超额分成', '有限合伙人超额分成'],
      [
        ['1', '1/3', '2/3'],
        ['2', '1/4', '3/4'],
        ['3', '1/6', '5/6'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/he-huo-ren-xin/1961nian-zhong-ba-fei-te-zhi-he-huo-ren-xin.md');

    expect(cells(table, 'thead').map(hasNumericClass)).toEqual([false, true, true]);
  });

  it('classifies growth values with year ranges while ignoring the domain placeholder', () => {
    const { tree, table } = fixture(
      ['年份', '此后每股收益复合增长率'],
      [
        ['1964', '无意义 (1964-2003)'],
        ['1968', '22.8% (1968-2003)'],
        ['1973', '20.8% (1973-2003)'],
        ['1978', '21.1% (1978-2003)'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/2003-ba-fei-te-zhi-gu-dong-xin.md');

    expect(hasNumericClass(cells(table, 'thead')[1])).toBe(true);
  });

  it('ignores insurance result placeholders when calculating numeric majorities', () => {
    const { tree, table } = fixture(
      ['年度', '承保损失', '浮存金近似成本'],
      [
        ['1967', '盈利', '低于零'],
        ['1968', '承保盈利', '无意义'],
        ['1969', '亏损', '低于零'],
        ['1970', '承保亏损', '无意义'],
        ['1971', '$ 0.37', '1.14%'],
        ['1972', '7.36', '9.30%'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/1994-ba-fei-te-zhi-gu-dong-xin.md');

    expect(cells(table, 'thead').map(hasNumericClass)).toEqual([false, true, true]);
  });

  it('ignores empty and placeholder cells when calculating the numeric majority', () => {
    const { tree, table } = fixture(
      ['项目', '金额'],
      [
        ['现金', '$1,200'],
        ['收益', '32.5%'],
        ['备注', '待审计'],
        ['缺失', ''],
        ['缺失', '—'],
        ['缺失', '–'],
        ['缺失', '不适用'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/he-huo-ren-xin/example.md');

    expect(hasNumericClass(cells(table, 'thead')[1])).toBe(true);
  });

  it('keeps predominantly textual later columns left aligned', () => {
    const { tree, table } = fixture(
      ['股份数量', '公司', 'CEO', '成本'],
      [
        ['10,000', '可口可乐', 'James Quincey', '$1,000'],
        ['20,000', '美国运通', 'Stephen Squeri', '$2,000'],
        ['30,000', '比亚迪', '王传福', '$3,000'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/gu-dong-xin/example.md');

    const header = cells(table, 'thead');
    expect(header.map(hasNumericClass)).toEqual([false, false, false, true]);
  });

  it('never classifies the first column as numeric', () => {
    const { tree, table } = fixture(
      ['年份', '结果'],
      [
        ['1962', '盈利'],
        ['1963', '亏损'],
        ['1964', '持平'],
      ],
    );

    transform(tree, '/repo/buffett/berkshire/he-huo-ren-xin/example.md');

    const firstColumn = cells(table, 'tbody').filter((_, index) => index % 2 === 0);
    expect(firstColumn.every((node) => !hasNumericClass(node))).toBe(true);
    expect(hasNumericClass(cells(table, 'thead')[0])).toBe(false);
  });
});
