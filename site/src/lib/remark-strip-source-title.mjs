export function remarkStripSourceTitle(options = {}) {
  const shouldRun = options.shouldRun ?? (() => true);

  return (tree, file) => {
    if (!shouldRun(file)) return;
    const first = tree.children?.[0];
    if (first?.type === 'heading' && first.depth === 1) {
      tree.children.shift();
    }
    // 长访谈/问答用 H1 标记「上午场」「下午场」等小节；页面标题已由模板渲染，
    // 正文其余 H1 降为 H2，保证每页只有一个 H1。
    for (const child of tree.children ?? []) {
      if (child?.type === 'heading' && child.depth === 1) child.depth = 2;
    }
  };
}
