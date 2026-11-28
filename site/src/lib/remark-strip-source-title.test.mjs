import { describe, it, expect } from 'vitest';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import { remarkStripSourceTitle } from './remark-strip-source-title.mjs';

async function render(md, options = {}) {
  const file = await remark()
    .use(remarkStripSourceTitle, options)
    .use(remarkHtml, { sanitize: false })
    .process(md);
  return String(file);
}

describe('remarkStripSourceTitle', () => {
  it('removes the opening H1 and demotes later H1s when enabled for the file', async () => {
    const html = await render('# 标题\n\n正文\n\n# 后续章节', {
      shouldRun: () => true,
    });

    expect(html).not.toContain('<h1>标题</h1>');
    expect(html).toContain('<p>正文</p>');
    // 页面标题由模板渲染，正文其余 H1 降为 H2，保证每页只有一个 H1
    expect(html).toContain('<h2>后续章节</h2>');
  });

  it('keeps the document unchanged when disabled for the file', async () => {
    const html = await render('# 标题\n\n正文', {
      shouldRun: () => false,
    });

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<p>正文</p>');
  });
});
