import { visit } from 'unist-util-visit';

const WIKILINK = /\[\[([^\]]+)\]\]/g;

/**
 * remark 插件:把 text 节点里的 [[关键词]] / [[关键词|显示]] 替换为链接节点。
 * options.lookup: Map<string, { url, keyword }>
 * 解析不到的关键词直接抛错,中断构建。
 */
export function remarkWikilink(options = {}) {
  const lookup = options.lookup;
  if (!lookup) throw new Error('remarkWikilink: 缺少 lookup');

  return (tree, file) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === null) return;
      const value = node.value;
      if (!value.includes('[[')) return;

      const children = [];
      let lastIndex = 0;
      let match;
      WIKILINK.lastIndex = 0;
      while ((match = WIKILINK.exec(value)) !== null) {
        const [full, inner] = match;
        const [rawKeyword, rawDisplay] = inner.split('|');
        const keyword = rawKeyword.trim();
        const display = (rawDisplay ?? rawKeyword).trim();
        const entry = lookup.get(keyword);
        if (!entry) {
          throw new Error(
            `死链: 关键词 [[${keyword}]] 不在注册表中` +
              (file?.path ? ` (文件 ${file.path})` : ''),
          );
        }
        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) });
        }
        children.push({
          type: 'link',
          url: entry.url,
          data: { hProperties: { className: 'wikilink', 'data-keyword': entry.keyword } },
          children: [{ type: 'text', value: display }],
        });
        lastIndex = match.index + full.length;
      }
      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) });
      }
      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}
