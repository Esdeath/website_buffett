// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildArticleCopyContent,
  buildArticleShareText,
  buildFullArticleCopyContent,
  installArticleCopyAttribution,
  writeArticleShare,
} from './article-share';

const SOURCE = {
  title: '复利',
  url: 'https://buffett.example/keywords/fu-li',
};

/** 读同仓库里的 .astro 源文件，断言接线没有在后续重构里被改回去。 */
const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function selectContents(node: Node): void {
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.addRange(range);
}

/** 模拟浏览器的 copy 事件，返回可断言的 clipboardData.setData 收集器。 */
function dispatchCopy(): { event: Event; data: Record<string, string> } {
  const data: Record<string, string> = {};
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      setData: (type: string, value: string) => {
        data[type] = value;
      },
    },
  });
  document.dispatchEvent(event);
  return { event, data };
}

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('buildArticleShareText', () => {
  it('以裸标题开头，后面只跟一行原文链接', () => {
    expect(buildArticleShareText(SOURCE)).toBe(
      '复利\n原文链接：https://buffett.example/keywords/fu-li',
    );
  });
});

describe('buildFullArticleCopyContent', () => {
  it('按标题 + 正文 + 末尾出处的顺序拼出纯文本', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>第一段</p><p>第二段</p>';
    document.body.append(root);

    const content = buildFullArticleCopyContent(SOURCE, root);

    expect(content.text).toBe(
      '复利\n\n第一段\n第二段\n\n原文链接：https://buffett.example/keywords/fu-li',
    );
  });

  it('正文包在带白底深字的 article 里，出处只在末尾出现一次', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p>';
    document.body.append(root);

    const content = buildFullArticleCopyContent(SOURCE, root);
    const holder = document.createElement('div');
    holder.innerHTML = content.html;
    const article = holder.querySelector('article')!;

    expect(content.html.startsWith('<article style="color:#222;background-color:#fff"><h1>复利</h1>')).toBe(true);
    expect(content.html.endsWith(
      '<p>原文链接：<a href="https://buffett.example/keywords/fu-li">https://buffett.example/keywords/fu-li</a></p></article>',
    )).toBe(true);
    expect((content.html.match(/原文链接：/g) ?? [])).toHaveLength(1);
    expect(article.lastElementChild?.textContent).toBe(
      '原文链接：https://buffett.example/keywords/fu-li',
    );
  });

  it('标题和链接按 HTML 转义，纯文本保持原字面量', () => {
    const root = document.createElement('div');
    root.textContent = '正文';
    document.body.append(root);
    const source = {
      title: '<投资 & 经营>',
      url: 'https://buffett.example/a?x=1&y="2"',
    };

    const content = buildFullArticleCopyContent(source, root);

    expect(content.text).toBe(
      '<投资 & 经营>\n\n正文\n\n原文链接：https://buffett.example/a?x=1&y="2"',
    );
    expect(content.html).toContain('<h1>&lt;投资 &amp; 经营&gt;</h1>');
    expect(content.html).toContain('href="https://buffett.example/a?x=1&amp;y=&quot;2&quot;"');
    expect(content.html).toContain('>https://buffett.example/a?x=1&amp;y=&quot;2&quot;</a>');
  });

  it('内联排版样式、去掉页面属性、修正表格与引用样式，并删除注释', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <p id="lead" class="lead" data-kind="intro" style="color: red">正文 <strong>重点</strong></p>
      <blockquote>引用</blockquote>
      <table><tbody><tr><td>1965</td><th>年份</th></tr></tbody></table>
      <a href="/keywords/hu-cheng-he">护城河</a>
      <img src="../../images/annual-report.png" alt="年报" />
      <!-- 注释节点 -->
    `;
    document.body.append(root);

    const content = buildFullArticleCopyContent(
      { title: '商业模式', url: 'https://buffett.example/articles/company/berkshire' },
      root,
    );
    const holder = document.createElement('div');
    holder.innerHTML = content.html;
    const paragraph = holder.querySelector('article div > p')!;
    const blockquote = holder.querySelector('article blockquote')!;
    const cells = holder.querySelectorAll('article td, article th');
    const image = holder.querySelector('article img')!;

    // 页面上的 id / class / data-* / style 都不能被带进剪贴板。
    expect(paragraph.hasAttribute('id')).toBe(false);
    expect(paragraph.hasAttribute('class')).toBe(false);
    expect(paragraph.hasAttribute('data-kind')).toBe(false);
    expect(paragraph.style.color).toBe('');
    expect(blockquote.style.borderLeftWidth).toBe('3px');
    expect(blockquote.style.borderLeftStyle).toBe('solid');
    expect(blockquote.style.borderLeftColor).toBe('#aaa');
    for (const cell of cells) {
      expect(cell.style.borderTopWidth).toBe('1px');
      expect(cell.style.borderTopColor).toBe('#ccc');
    }
    expect(image.style.maxWidth).toBe('100%');
    expect(content.html).not.toContain('注释节点');
  });

  it('把相对链接和图片地址按原文链接绝对化', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <a href="/keywords/hu-cheng-he">护城河</a>
      <img src="../../images/annual-report.png" alt="年报" />
    `;
    document.body.append(root);

    const content = buildFullArticleCopyContent(
      { title: '商业模式', url: 'https://buffett.example/articles/company/berkshire' },
      root,
    );
    const holder = document.createElement('div');
    holder.innerHTML = content.html;

    expect(holder.querySelector('article a')?.getAttribute('href')).toBe(
      'https://buffett.example/keywords/hu-cheng-he',
    );
    expect(holder.querySelector('article img')?.getAttribute('src')).toBe(
      'https://buffett.example/images/annual-report.png',
    );
  });
});

describe('buildArticleCopyContent', () => {
  it('在选区后面补上标题和原文链接尾注', () => {
    const content = buildArticleCopyContent(
      { title: '苹果：产品、商业模式与生态｜巴菲特知识库', url: 'https://buffett.example/keywords/ping-guo' },
      { html: '<p>正文 <strong>重点</strong></p>', text: '正文 重点' },
    );

    expect(content.text).toBe(
      '正文 重点\n\n苹果：产品、商业模式与生态｜巴菲特知识库\n原文链接：https://buffett.example/keywords/ping-guo',
    );
    expect(content.html).toBe(
      '<p>正文 <strong>重点</strong></p><p>苹果：产品、商业模式与生态｜巴菲特知识库<br>原文链接：<a href="https://buffett.example/keywords/ping-guo">https://buffett.example/keywords/ping-guo</a></p>',
    );
  });

  it('出处只在选区末尾出现一次，转义标题与链接但不动选区标记', () => {
    const content = buildArticleCopyContent(
      { title: '<投资 & 经营>', url: 'https://buffett.example/a?x=1&y="2"' },
      { html: '<ul><li><a href="https://buffett.example/b">正文链接</a></li></ul>', text: '正文链接' },
    );

    expect(content.html.startsWith('<ul><li><a href="https://buffett.example/b">正文链接</a></li></ul><p>')).toBe(true);
    expect((content.html.match(/原文链接：/g) ?? [])).toHaveLength(1);
    expect(content.html).toMatch(/^<ul>[\s\S]*<\/ul><p>&lt;投资 &amp; 经营&gt;<br>/);
    expect(content.html).toMatch(/href="https:\/\/buffett\.example\/a\?x=1&amp;y=&quot;2&quot;"/);
  });
});

describe('installArticleCopyAttribution', () => {
  it('选区落在正文根内时改写剪贴板内容并阻止默认复制', () => {
    const root = document.createElement('div');
    root.id = 'copy-root-selection';
    root.innerHTML = '<p>正文 <strong>重点</strong></p>';
    document.body.append(root);
    installArticleCopyAttribution(root.id, () => SOURCE);

    selectContents(root);
    const { event, data } = dispatchCopy();

    expect(event.defaultPrevented).toBe(true);
    expect(data['text/plain']).toBe(
      '正文 重点\n\n复利\n原文链接：https://buffett.example/keywords/fu-li',
    );
    expect(data['text/html']).toBe(
      '<p>正文 <strong>重点</strong></p><p>复利<br>原文链接：<a href="https://buffett.example/keywords/fu-li">https://buffett.example/keywords/fu-li</a></p>',
    );
  });

  it('选区跨出正文根时放行浏览器默认复制', () => {
    const root = document.createElement('div');
    root.id = 'copy-root-contain';
    root.innerHTML = '<p>正文</p>';
    const outside = document.createElement('p');
    outside.textContent = '侧边栏文字';
    document.body.append(root, outside);
    installArticleCopyAttribution(root.id, () => SOURCE);

    selectContents(outside);
    const { event, data } = dispatchCopy();

    expect(event.defaultPrevented).toBe(false);
    expect(data['text/plain']).toBeUndefined();
    expect(data['text/html']).toBeUndefined();
  });

  it('同一个正文根只注册一个 copy 监听', () => {
    const root = document.createElement('div');
    root.id = 'copy-root-once';
    root.innerHTML = '<p>正文</p>';
    document.body.append(root);
    let sourceCalls = 0;
    const source = () => {
      sourceCalls += 1;
      return SOURCE;
    };
    installArticleCopyAttribution(root.id, source);
    installArticleCopyAttribution(root.id, source);

    selectContents(root);
    dispatchCopy();

    expect(sourceCalls).toBe(1);
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

describe('接线', () => {
  it('整篇复制根只包正文，h1 留在外面，按钮拿到标题', () => {
    const layout = readSource('../layouts/ArticleLayout.astro');
    const sources = readSource('../pages/sources/[group]/[slug].astro');

    expect(layout).toContain('<CopyArticleButton targetId="article-share-body" title={article.title} />');
    expect(layout).toMatch(/<h1>\{article\.title\}<\/h1>[\s\S]*?<div id="article-share-body">[\s\S]*?<Content \/>[\s\S]*?<\/div>/);
    expect(sources).toContain('<CopyArticleButton targetId="article-share-body" title={source.title} />');
    expect(sources).toMatch(/<h1>\{source\.title\}<\/h1>[\s\S]*?<div id="article-share-body">[\s\S]*?<Content \/>[\s\S]*?<\/div>/);
  });

  it('按钮用 canonical 作为出处链接，缺省时回退到当前路径', () => {
    const component = readSource('../components/CopyArticleButton.astro');

    expect(component).toContain('data-article-title={title}');
    expect(component).toContain('link[rel="canonical"]');
    expect(component).toMatch(/new URL\(window\.location\.href\)/);
    expect(component).toContain("url.search = ''");
    expect(component).toContain("url.hash = ''");
    expect(component).toContain('buildFullArticleCopyContent');
    expect(component).toContain('installArticleCopyAttribution');
    expect(component).toContain('writeArticleShare');
    // 出处只保留「原文链接」一种，不再带站点名。
    expect(component).not.toContain('data-site-name');
    expect(component).not.toContain('SITE.name');
  });

  it('旧的顶部 + 底部双出处实现已经删掉', () => {
    const lib = readSource('./article-share.ts');

    expect(lib).not.toContain('createArticleSharePayload');
    expect(lib).not.toContain('createAttribution');
  });
});
