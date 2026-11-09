export interface ArticleShareSource {
  title: string;
  url: string;
}

export interface ArticleSelection {
  html: string;
  text: string;
}

export interface ArticleCopyContent {
  html: string;
  text: string;
}

// 复制的纯文本出处统一写成：标题 + 原文链接。
export function buildArticleShareText(source: ArticleShareSource): string {
  return `${source.title}\n原文链接：${source.url}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stripComments(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  for (const comment of comments) comment.remove();
}

// 整篇复制：外层 <article> 自带白底深字，正文内联排版样式，出处只在末尾出现一次。
export function buildFullArticleCopyContent(
  source: ArticleShareSource,
  root: HTMLElement,
): ArticleCopyContent {
  const body = root.cloneNode(true) as HTMLElement;
  const originals = [root, ...root.querySelectorAll<HTMLElement>('*')];
  const copies = [body, ...body.querySelectorAll<HTMLElement>('*')];
  // 剪贴板拿不到站点 CSS，只保留排版样式，避免把深色主题的文字颜色带到白底编辑器。
  const properties = [
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'text-align',
    'text-decoration-line',
    'white-space',
    'margin-top',
    'margin-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'padding-bottom',
    'list-style-type',
    'border-collapse',
  ];

  copies.forEach((copy, index) => {
    const original = originals[index]!;
    const computed = getComputedStyle(original);
    for (const attribute of [...copy.attributes]) {
      if (
        attribute.name === 'id' ||
        attribute.name === 'class' ||
        attribute.name === 'style' ||
        attribute.name.startsWith('data-')
      ) {
        copy.removeAttribute(attribute.name);
      }
    }
    for (const property of properties) {
      copy.style.setProperty(property, computed.getPropertyValue(property));
    }
    if (copy.matches('td, th')) copy.style.border = '1px solid #ccc';
    if (copy.matches('blockquote')) copy.style.borderLeft = '3px solid #aaa';
    if (copy.matches('img')) copy.style.maxWidth = '100%';
    for (const attribute of ['href', 'src'] as const) {
      const value = copy.getAttribute(attribute);
      if (!value) continue;
      try {
        copy.setAttribute(attribute, new URL(value, source.url).href);
      } catch {
        // 无法解析的值（模板占位等）保持原样。
      }
    }
  });

  stripComments(body);

  return {
    html: `<article style="color:#222;background-color:#fff"><h1>${escapeHtml(source.title)}</h1>${body.outerHTML}<p>原文链接：<a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a></p></article>`,
    text: `${source.title}\n\n${root.innerText.trim()}\n\n原文链接：${source.url}`,
  };
}

// 正文选区复制：在选区 HTML 后面补一段「标题 + 原文链接」尾注。
export function buildArticleCopyContent(
  source: ArticleShareSource,
  selection: ArticleSelection,
): ArticleCopyContent {
  const safeTitle = escapeHtml(source.title);
  const safeUrl = escapeHtml(source.url);

  return {
    html: `${selection.html}<p>${safeTitle}<br>原文链接：<a href="${safeUrl}">${safeUrl}</a></p>`,
    text: `${selection.text}\n\n${buildArticleShareText(source)}`,
  };
}

// 同一个正文根只需要一个 copy 监听：页面脚本重复挂载时直接跳过。
const installedCopyTargets = new Set<string>();

// 读者在正文里选中文字复制时，往剪贴板里补一段标题 + 原文链接的尾注。
// 只接管落在正文容器内的选区；选区跨出正文（比如连侧边栏一起框选）就让浏览器按默认行为复制。
export function installArticleCopyAttribution(
  targetId: string,
  source: () => ArticleShareSource,
): void {
  if (installedCopyTargets.has(targetId)) return;
  installedCopyTargets.add(targetId);

  document.addEventListener('copy', (event) => {
    const root = document.getElementById(targetId);
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
    if (!event.clipboardData) return;

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const text = selection.toString().trim();
    if (!text) return;

    // cloneContents 会把 Astro 的 fragment 锚点注释一起复制出去，粘贴到别处是噪音。
    const holder = document.createElement('div');
    holder.append(range.cloneContents());
    stripComments(holder);

    const content = buildArticleCopyContent(source(), { html: holder.innerHTML, text });
    event.clipboardData.setData('text/plain', content.text);
    event.clipboardData.setData('text/html', content.html);
    event.preventDefault();
  });
}

interface ClipboardPort {
  write?: (items: unknown[]) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

export interface ArticleShareClipboardOptions {
  clipboard?: ClipboardPort;
  createClipboardItem?: (data: Record<string, Blob>) => unknown;
}

export async function writeArticleShare(
  payload: ArticleCopyContent,
  options: ArticleShareClipboardOptions = {},
): Promise<void> {
  const clipboard = options.clipboard ?? (navigator.clipboard as ClipboardPort);
  const createClipboardItem =
    options.createClipboardItem ??
    (typeof ClipboardItem === 'undefined'
      ? undefined
      : (data: Record<string, Blob>) => new ClipboardItem(data));

  if (clipboard.write && createClipboardItem) {
    try {
      const item = createClipboardItem({
        'text/html': new Blob([payload.html], { type: 'text/html' }),
        'text/plain': new Blob([payload.text], { type: 'text/plain' }),
      });
      await clipboard.write([item]);
      return;
    } catch (error) {
      if (!clipboard.writeText) throw error;
    }
  }

  if (clipboard.writeText) {
    await clipboard.writeText(payload.text);
    return;
  }

  throw new Error('Clipboard API is unavailable');
}
