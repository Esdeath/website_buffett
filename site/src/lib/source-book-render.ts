import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { remark } from 'remark';
import gfm from 'remark-gfm';
import html from 'remark-html';
import { visit } from 'unist-util-visit';
import { parseRegistry, buildLookup } from './registry';
import { pathToUrl } from './url';
import { remarkWikilink } from './remark-wikilink.mjs';
import { REPO_ROOT, plainNodeText, type SourceBookEntry } from './source-book';

const lookup = new Map([...buildLookup(parseRegistry(readFileSync(join(REPO_ROOT, 'docs/keyword-registry.md'), 'utf8')))]
  .map(([term, entry]) => [term, { keyword: entry.keyword, url: pathToUrl(entry.path) }]));
const definitions = new Map<string, any[]>();
const parser = remark().use(gfm);
const processor = remark().use(gfm).use(remarkWikilink, { lookup }).use(html, { sanitize: false });

/** 仅清理编排标签里的旧编号；原始标题仍随正文照录。 */
export const sourceEntryDisplayTitle = (title: string) => title.replace(/^\s*(?:\d+\s*[、.．，,：:）)]|(?:Q(?:uestion)?|问题|問题)\s*\d*\s*[：:.、])\s*/i, '').trim();
export function sourceEntryRepeatsHeading(entry: SourceBookEntry): boolean {
  const first = parser.parse(entry.body).children.find((node) => !['html', 'thematicBreak'].includes(node.type));
  const normalize = (value: string) => sourceEntryDisplayTitle(value).replace(/[\s\u200b]/g, '');
  return first?.type === 'heading' && normalize(plainNodeText(first)) === normalize(entry.title);
}

/** 只转换显示格式，原文书稿与 entry.body 始终保留原始字节。 */
export async function renderSourceEntry(entry: SourceBookEntry): Promise<string> {
  if (!definitions.has(entry.source.path)) {
    const parsed = parser.parse(entry.source.body);
    definitions.set(entry.source.path, parsed.children.filter((n) => n.type === 'definition' || n.type === 'footnoteDefinition'));
  }
  // 引用定义必须在 parse 时就可见，否则 [文字][ref] 会被当作普通文本。
  // 直接解析原始切片也能正确处理相邻原文锚点在同一个 Markdown 节点的情况。
  const outsideDefinitions = definitions.get(entry.source.path)!
    .filter((n) => n.position.start.offset < entry.start || n.position.start.offset >= entry.end)
    .map((n) => entry.source.body.slice(n.position.start.offset, n.position.end.offset)).join('\n\n');
  const tree = parser.parse(`${entry.body}\n\n${outsideDefinitions}`);
  const headingBase = Math.min(...tree.children.filter((n: any) => n.type === 'heading').map((n: any) => n.depth));
  visit(tree, (node: any) => {
    // 原稿用尖括号标注的姓名不是 HTML 标签；按原稿文字显示。
    if (node.type === 'html' && /^<(?:Eli Broad|John Doerr|Gerry Lenfest|John Morgridge)>$/.test(node.value)) node.type = 'text';
    if (node.type === 'heading') node.depth = Math.min(6, 4 + node.depth - headingBase);
    if (node.type === 'image' && /^\/content\/buffett\/[^/]+\/images\//.test(node.url)) node.url = `/images/${node.url.split('/').at(-1)}`;
    if ((node.type === 'link' || node.type === 'definition') && node.url?.startsWith('#')) node.url = `${entry.source.url}${node.url}`;
  });
  return String(processor.stringify(await processor.run(tree)));
}
