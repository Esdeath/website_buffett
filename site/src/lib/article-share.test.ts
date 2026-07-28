// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createArticleSharePayload, writeArticleShare } from './article-share';

describe('createArticleSharePayload', () => {
  it('wraps preserved article markup with linked attribution at both ends', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <h1>复利</h1>
      <blockquote><strong>时间</strong>是好生意的朋友。</blockquote>
      <table><tbody><tr><td>1965</td><td>2025</td></tr></tbody></table>
    `;
    const url = 'https://buffett.example/keywords/fu-li';

    const payload = createArticleSharePayload(article, url, '巴菲特知识库');
    const result = document.createElement('div');
    result.innerHTML = payload.html;

    expect(result.querySelector('article h1')?.textContent).toBe('复利');
    expect(result.querySelector('article blockquote strong')?.textContent).toBe('时间');
    expect(result.querySelectorAll('article table td')).toHaveLength(2);
    expect(result.querySelectorAll(`a[href="${url}"]`)).toHaveLength(4);
    expect(payload.text.startsWith(`巴菲特知识库\n${url}\n\n`)).toBe(true);
    expect(payload.text.endsWith(`\n\n巴菲特知识库\n${url}`)).toBe(true);
    expect(payload.text).toContain('复利');
  });

  it('turns relative links and image sources into absolute URLs', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <a href="/keywords/hu-cheng-he">护城河</a>
      <img src="../../images/annual-report.png" alt="年报" />
    `;

    const payload = createArticleSharePayload(
      article,
      'https://buffett.example/articles/company/berkshire',
      '巴菲特知识库',
    );
    const result = document.createElement('div');
    result.innerHTML = payload.html;

    expect(result.querySelector('article a')?.getAttribute('href')).toBe(
      'https://buffett.example/keywords/hu-cheng-he',
    );
    expect(result.querySelector('article img')?.getAttribute('src')).toBe(
      'https://buffett.example/images/annual-report.png',
    );
  });
});

describe('writeArticleShare', () => {
  const payload = { html: '<p><strong>复利</strong></p>', text: '复利' };

  it('writes HTML and plain-text blobs in one clipboard item', async () => {
    let clipboardItemData: Record<string, Blob> = {};
    let writtenItems: unknown[] = [];

    await writeArticleShare(payload, {
      clipboard: {
        write: async (items) => {
          writtenItems = items;
        },
      },
      createClipboardItem: (data) => {
        clipboardItemData = data;
        return data;
      },
    });

    expect(writtenItems).toHaveLength(1);
    expect(await clipboardItemData['text/html'].text()).toBe(payload.html);
    expect(await clipboardItemData['text/plain'].text()).toBe(payload.text);
  });

  it('falls back to plain text when rich clipboard writing is unavailable', async () => {
    let copiedText = '';

    await writeArticleShare(payload, {
      clipboard: {
        writeText: async (text) => {
          copiedText = text;
        },
      },
    });

    expect(copiedText).toBe(payload.text);
  });

  it('falls back to plain text when rich clipboard writing fails', async () => {
    let copiedText = '';

    await writeArticleShare(payload, {
      clipboard: {
        write: async () => {
          throw new Error('HTML clipboard rejected');
        },
        writeText: async (text) => {
          copiedText = text;
        },
      },
      createClipboardItem: (data) => data,
    });

    expect(copiedText).toBe(payload.text);
  });
});
