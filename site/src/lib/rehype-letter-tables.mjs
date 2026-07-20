const LETTER_SOURCE_RE = /[/\\]buffett[/\\]berkshire[/\\](?:gu-dong-xin|he-huo-ren-xin)[/\\]/;
const YEAR_RANGE = String.raw`[（(]\s*\d{4}\s*[-–—]\s*\d{4}\s*[）)]`;
const DOMAIN_PLACEHOLDER = String.raw`(?:承保)?(?:盈利|亏损)|低于零|无意义`;
const PLACEHOLDER_RE = new RegExp(
  String.raw`^(?:[-–—−]+|不适用|N\/?A|(?:${DOMAIN_PLACEHOLDER})(?:\s*${YEAR_RANGE})?)$`,
  'iu',
);

const CURRENCY = String.raw`(?:US\$|HK\$|RMB|CNY|USD|HKD|[$¥￥€£])?`;
const NUMBER = String.raw`(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)`;
const MAGNITUDE = String.raw`(?:${NUMBER}|\d+\s*\/\s*\d+)`;
const UNIT = String.raw`(?:[%％]|股|倍|(?:万|亿|兆)?(?:美元|港元|人民币|元))?`;
const SIGNED_VALUE = String.raw`[+\-−]?\s*${CURRENCY}\s*${MAGNITUDE}\s*${UNIT}`;
const PAREN_VALUE = String.raw`[（(]\s*${CURRENCY}\s*[+\-−]?\s*${MAGNITUDE}\s*${UNIT}\s*[）)]`;
const SHORT_ANNOTATION = String.raw`(?:\s*[（(][\p{Script=Han}\p{L}][\p{Script=Han}\p{L}\d\s]{0,11}[）)])?`;
const NUMERIC_FOOTNOTES = String.raw`(?:\s*[（(]\d+[）)])*`;
const YEAR_RANGE_ANNOTATION = String.raw`(?:\s*${YEAR_RANGE})?`;
const FOOTNOTE_MARK = String.raw`(?:\s*[*＊†‡]+)?`;
const FINANCIAL_VALUE_RE = new RegExp(
  String.raw`^(?:${SIGNED_VALUE}|${PAREN_VALUE})${SHORT_ANNOTATION}${NUMERIC_FOOTNOTES}${YEAR_RANGE_ANNOTATION}${FOOTNOTE_MARK}$`,
  'u',
);

function isElement(node, tagName) {
  return node?.type === 'element' && node.tagName === tagName;
}

function childElements(node, tagName) {
  return (node.children ?? []).filter((child) => isElement(child, tagName));
}

function nodeText(node) {
  if (node?.type === 'text') return node.value;
  return (node?.children ?? []).map(nodeText).join('');
}

function addClass(node, className) {
  node.properties ??= {};
  const existing = node.properties.className;
  const classNames = Array.isArray(existing)
    ? existing
    : typeof existing === 'string'
      ? existing.split(/\s+/).filter(Boolean)
      : [];
  if (!classNames.includes(className)) classNames.push(className);
  node.properties.className = classNames;
}

function tableRows(table, sectionName) {
  const section = childElements(table, sectionName)[0];
  return section ? childElements(section, 'tr') : [];
}

function rowCells(row) {
  return (row.children ?? []).filter((node) => isElement(node, 'th') || isElement(node, 'td'));
}

function meaningfulValue(cell) {
  const value = nodeText(cell).replace(/\u00a0/g, ' ').trim();
  return value && !PLACEHOLDER_RE.test(value) ? value : null;
}

function classifyNumericColumns(table) {
  const headerRows = tableRows(table, 'thead');
  const bodyRows = tableRows(table, 'tbody');
  const columnCount = Math.max(0, ...bodyRows.map((row) => rowCells(row).length));

  for (let column = 1; column < columnCount; column += 1) {
    const values = bodyRows
      .map((row) => rowCells(row)[column])
      .filter(Boolean)
      .map(meaningfulValue)
      .filter(Boolean);
    const numericCount = values.filter((value) => FINANCIAL_VALUE_RE.test(value)).length;
    if (numericCount <= values.length / 2) continue;

    for (const row of [...headerRows, ...bodyRows]) {
      const currentCell = rowCells(row)[column];
      if (currentCell) addClass(currentCell, 'letter-table-numeric');
    }
  }
}

function transformTables(parent) {
  if (!Array.isArray(parent?.children)) return;

  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index];
    if (isElement(node, 'table')) {
      classifyNumericColumns(node);
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['letter-table-scroll'] },
        children: [node],
      };
      continue;
    }
    transformTables(node);
  }
}

/** Wrap and classify Markdown tables only in Berkshire shareholder and partner letters. */
export function rehypeLetterTables() {
  return (tree, file) => {
    if (!LETTER_SOURCE_RE.test(file?.path ?? '')) return;
    transformTables(tree);
  };
}
