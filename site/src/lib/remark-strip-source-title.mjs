export function remarkStripSourceTitle(options = {}) {
  const shouldRun = options.shouldRun ?? (() => true);

  return (tree, file) => {
    if (!shouldRun(file)) return;
    const first = tree.children?.[0];
    if (first?.type === 'heading' && first.depth === 1) {
      tree.children.shift();
    }
  };
}
