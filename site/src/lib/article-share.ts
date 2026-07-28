export interface ArticleSharePayload {
  html: string;
  text: string;
}

function createAttribution(
  document: Document,
  siteName: string,
  pageUrl: string,
): HTMLParagraphElement {
  const attribution = document.createElement('p');
  const siteLink = document.createElement('a');
  const urlLink = document.createElement('a');

  siteLink.href = pageUrl;
  siteLink.textContent = siteName;
  urlLink.href = pageUrl;
  urlLink.textContent = pageUrl;

  const strong = document.createElement('strong');
  strong.append(siteLink);
  attribution.append(strong, document.createElement('br'), urlLink);
  return attribution;
}

function makeUrlsAbsolute(root: HTMLElement, pageUrl: string): void {
  for (const element of root.querySelectorAll<HTMLElement>('[href], [src]')) {
    for (const attribute of ['href', 'src'] as const) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      try {
        element.setAttribute(attribute, new URL(value, pageUrl).href);
      } catch {
        // Preserve malformed or application-specific values unchanged.
      }
    }
  }
}

export function createArticleSharePayload(
  article: HTMLElement,
  pageUrl: string,
  siteName: string,
): ArticleSharePayload {
  const document = article.ownerDocument;
  const clone = article.cloneNode(true) as HTMLElement;
  const wrapper = document.createElement('div');

  makeUrlsAbsolute(clone, pageUrl);
  wrapper.append(
    createAttribution(document, siteName, pageUrl),
    clone,
    createAttribution(document, siteName, pageUrl),
  );

  const articleText = article.innerText.trim();
  return {
    html: wrapper.innerHTML,
    text: `${siteName}\n${pageUrl}\n\n${articleText}\n\n${siteName}\n${pageUrl}`,
  };
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
  payload: ArticleSharePayload,
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
