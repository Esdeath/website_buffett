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
  it('removes only the opening H1 when enabled for the file', async () => {
    const html = await render('# 标题\n\n正文\n\n# 后续章节', {
      shouldRun: () => true,
    });

    expect(html).not.toContain('<h1>标题</h1>');
    expect(html).toContain('<p>正文</p>');
    expect(html).toContain('<h1>后续章节</h1>');
  });

  it('keeps the document unchanged when disabled for the file', async () => {
    const html = await render('# 标题\n\n正文', {
      shouldRun: () => false,
    });

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<p>正文</p>');
  });
});
