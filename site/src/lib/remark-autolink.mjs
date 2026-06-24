import { visit } from 'unist-util-visit';

/**
 * remark 插件:扫描原文正文 text 节点,把注册表关键词/别名自动转成链接。
 * 与 remarkWikilink([[ ]] 显式标记) 互补 —— 本插件针对没有手写标记的原文,
 * 自动识别裸关键词。规则:
 *   - 每篇文档每个目标词条只链「第一次出现」(seen 去重)。
 *   - 长词优先匹配,避免「内在价值」被「价值」抢先截断。
 *   - 已在链接节点内的文本不再处理(visit 不会进入已生成的 link)。
 *   - 仅作用于 shouldRun(file) 为真的文件(原文目录),解读文章不受影响。
 *
 * options.lookup: Map<string, { url, keyword }>   关键词/别名 → 目标
 * options.shouldRun: (file) => boolean            决定本文件是否启用自动链接
 */
export function remarkAutolink(options = {}) {
  const lookup = options.lookup;
  const shouldRun = options.shouldRun ?? (() => true);
  if (!lookup) throw new Error('remarkAutolink: 缺少 lookup');

  // 所有可匹配词(关键词 + 别名),长词在前。一次性构造,跨文件复用。
  const terms = [...lookup.keys()].sort((a, b) => b.length - a.length);

  return (tree, file) => {
    if (!shouldRun(file)) return;
    const seen = new Set(); // 本文档已链接过的目标 url,保证每词条只链首次

    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === null) return;
      // 不在已有链接内部加套娃链接
      if (parent.type === 'link') return;

      const value = node.value;
      // 在本段文本里找「最早出现、且尚未链接过」的某个词
      let best = null; // { term, entry, at }
      for (const term of terms) {
        const entry = lookup.get(term);
        if (seen.has(entry.url)) continue;
        const at = value.indexOf(term);
        if (at === -1) continue;
        if (!best || at < best.at || (at === best.at && term.length > best.term.length)) {
          best = { term, entry, at };
        }
      }
      if (!best) return;

      seen.add(best.entry.url);
      const before = value.slice(0, best.at);
      const after = value.slice(best.at + best.term.length);
      const children = [];
      if (before) children.push({ type: 'text', value: before });
      children.push({
        type: 'link',
        url: best.entry.url,
        data: { hProperties: { className: 'wikilink', 'data-keyword': best.entry.keyword } },
        children: [{ type: 'text', value: best.term }],
      });
      if (after) children.push({ type: 'text', value: after });
      parent.children.splice(index, 1, ...children);
      // 重新访问 after 文本(它可能还含其它待链接词),从 before+link 之后继续
      return index + (before ? 1 : 0) + 1;
    });
  };
}
