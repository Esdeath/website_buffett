import { describe, it, expect } from 'vitest';
import { remarkWikilink } from './remark-wikilink.mjs';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

// 最小查找表:关键词/别名 → { url, keyword }
const lookup = new Map([
  ['护城河', { url: '/keywords/hu-cheng-he', keyword: '护城河' }],
  ['避免永久性损失', { url: '/keywords/bi-mian-yong-jiu-xing-sun-shi', keyword: '避免永久性损失' }],
]);

async function render(md) {
  const file = await remark()
    .use(remarkWikilink, { lookup })
    .use(remarkHtml, { sanitize: false })
    .process(md);
  return String(file);
}

describe('remarkWikilink', () => {
  it('converts [[关键词]] to a link with the keyword as text', async () => {
    const html = await render('巴菲特看重[[护城河]]。');
    expect(html).toContain('<a href="/keywords/hu-cheng-he"');
    expect(html).toContain('>护城河</a>');
  });

  it('uses the right-hand display text for piped links', async () => {
    const html = await render('要[[避免永久性损失|不亏本]]。');
    expect(html).toContain('href="/keywords/bi-mian-yong-jiu-xing-sun-shi"');
    expect(html).toContain('>不亏本</a>');
  });

  it('throws on an unknown keyword', async () => {
    await expect(render('引用[[不存在的词]]。')).rejects.toThrow(/不存在的词/);
  });
});
