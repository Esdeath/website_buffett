# Article Copy Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “复制文章” button to every article detail page that copies rich HTML and plain text with the site name and current article URL at both ends.

**Architecture:** A browser-focused TypeScript module owns article cloning, URL normalization, payload construction, and clipboard fallback. A reusable Astro button component owns interaction and status UI, while the editorial and source templates only identify their article container and render the component.

**Tech Stack:** Astro 5, TypeScript, Vitest, happy-dom, Clipboard API, lucide-astro, CSS

## Global Constraints

- Cover `/keywords/`, `/articles/`, and `/sources/` article detail pages.
- Copy only the current `<article>`; exclude navigation, view controls, graph, source panels, sidebars, and the copy button.
- Write both `text/html` and `text/plain` when supported.
- Put “巴菲特知识库” and the current article URL at both the beginning and end of both formats.
- Preserve semantic article structure and convert relative `href` and `src` values to absolute URLs.
- Fall back to `navigator.clipboard.writeText()` when rich clipboard writing is unavailable or fails.
- Show non-blocking “已复制” or “复制失败” status and expose it through an ARIA live region.
- Do not modify Markdown content under `buffett/`.

---

### Task 1: Build and test the share payload

**Files:**
- Modify: `site/package.json`
- Modify: `site/package-lock.json`
- Create: `site/src/lib/article-share.ts`
- Create: `site/src/lib/article-share.test.ts`

**Interfaces:**
- Consumes: an `HTMLElement`, the current page URL, and the site name.
- Produces: `createArticleSharePayload(article: HTMLElement, pageUrl: string, siteName: string): ArticleSharePayload` where `ArticleSharePayload` is `{ html: string; text: string }`.

- [ ] **Step 1: Install the DOM test environment and the existing icon implementation**

Run from `site/`:

```bash
npm install lucide-astro
npm install --save-dev happy-dom
```

Expected: `lucide-astro` appears in `dependencies`, `happy-dom` appears in `devDependencies`, and the lockfile updates without audit errors that stop installation.

- [ ] **Step 2: Write failing payload tests**

Create `site/src/lib/article-share.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createArticleSharePayload } from './article-share';

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
      'https://buffett.example/articles/images/annual-report.png',
    );
  });
});
```

The first test catches missing/incorrect attribution or lost semantic markup. The second catches copied links that break after content leaves the site.

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
npx vitest run src/lib/article-share.test.ts
```

Expected: FAIL because `src/lib/article-share.ts` does not exist.

- [ ] **Step 4: Implement the minimal payload builder**

Create `site/src/lib/article-share.ts`:

```ts
export interface ArticleSharePayload {
  html: string;
  text: string;
}

function createAttribution(document: Document, siteName: string, pageUrl: string): HTMLParagraphElement {
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
        // Leave malformed or application-specific values unchanged.
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
  const top = createAttribution(document, siteName, pageUrl);
  const bottom = createAttribution(document, siteName, pageUrl);

  makeUrlsAbsolute(clone, pageUrl);
  wrapper.append(top, clone, bottom);

  const articleText = article.innerText.trim();
  return {
    html: wrapper.innerHTML,
    text: `${siteName}\n${pageUrl}\n\n${articleText}\n\n${siteName}\n${pageUrl}`,
  };
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/lib/article-share.test.ts
```

Expected: both tests pass.

- [ ] **Step 6: Commit the tested payload builder**

```bash
git add site/package.json site/package-lock.json site/src/lib/article-share.ts site/src/lib/article-share.test.ts
git commit -m "Add article share payload builder"
```

---

### Task 2: Add and test rich clipboard fallback

**Files:**
- Modify: `site/src/lib/article-share.ts`
- Modify: `site/src/lib/article-share.test.ts`

**Interfaces:**
- Consumes: `ArticleSharePayload` from Task 1 plus an optional clipboard adapter for tests.
- Produces: `writeArticleShare(payload: ArticleSharePayload, options?: ArticleShareClipboardOptions): Promise<void>`.

- [ ] **Step 1: Add failing rich and fallback tests**

Append inside `site/src/lib/article-share.test.ts` and extend the import:

```ts
import { createArticleSharePayload, writeArticleShare } from './article-share';

describe('writeArticleShare', () => {
  const payload = { html: '<p><strong>复利</strong></p>', text: '复利' };

  it('writes HTML and plain-text blobs in one clipboard item', async () => {
    let clipboardItemData: Record<string, Blob> | undefined;
    let writtenItems: unknown[] = [];

    await writeArticleShare(payload, {
      clipboard: { write: async (items) => { writtenItems = items; } },
      createClipboardItem: (data) => {
        clipboardItemData = data;
        return data;
      },
    });

    expect(writtenItems).toHaveLength(1);
    expect(await clipboardItemData?.['text/html'].text()).toBe(payload.html);
    expect(await clipboardItemData?.['text/plain'].text()).toBe(payload.text);
  });

  it('falls back to plain text when rich clipboard writing is unavailable', async () => {
    let copiedText = '';

    await writeArticleShare(payload, {
      clipboard: { writeText: async (text) => { copiedText = text; } },
    });

    expect(copiedText).toBe(payload.text);
  });

  it('falls back to plain text when rich clipboard writing fails', async () => {
    let copiedText = '';

    await writeArticleShare(payload, {
      clipboard: {
        write: async () => { throw new Error('HTML clipboard rejected'); },
        writeText: async (text) => { copiedText = text; },
      },
      createClipboardItem: (data) => data,
    });

    expect(copiedText).toBe(payload.text);
  });
});
```

These tests catch missing MIME types, skipping the compatibility path, and failure to recover when a nominally supported rich API rejects the write.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run src/lib/article-share.test.ts
```

Expected: FAIL because `writeArticleShare` is not exported.

- [ ] **Step 3: Implement clipboard writing**

Append to `site/src/lib/article-share.ts`:

```ts
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
  const clipboard = options.clipboard ?? navigator.clipboard;
  const createClipboardItem = options.createClipboardItem ??
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
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npx vitest run src/lib/article-share.test.ts
npm test
```

Expected: all article-share tests and the existing Vitest suite pass.

- [ ] **Step 5: Commit clipboard support**

```bash
git add site/src/lib/article-share.ts site/src/lib/article-share.test.ts
git commit -m "Support rich article clipboard copying"
```

---

### Task 3: Build the reusable copy button

**Files:**
- Create: `site/src/components/CopyArticleButton.astro`
- Consumes unchanged: `site/src/lib/seo.ts` for `SITE.name`
- Consumes tested: `site/src/lib/article-share.ts`

**Interfaces:**
- Consumes: `targetId: string`, identifying the article element to copy.
- Produces: a stable-size, accessible button that displays “复制文章”, “已复制”, or “复制失败”.

- [ ] **Step 1: Create the component using the tested share functions**

Create `site/src/components/CopyArticleButton.astro`:

```astro
---
import { Copy } from 'lucide-astro';
import { SITE } from '../lib/seo';

interface Props {
  targetId: string;
}

const { targetId } = Astro.props as Props;
---

<div class="copy-article-control">
  <button
    class="copy-article-button"
    type="button"
    data-copy-article
    data-target-id={targetId}
    data-site-name={SITE.name}
  >
    <Copy size={17} strokeWidth={1.8} aria-hidden="true" />
    <span data-copy-label>复制文章</span>
  </button>
  <span class="copy-article-status" role="status" aria-live="polite" data-copy-status></span>
</div>

<script>
  import { createArticleSharePayload, writeArticleShare } from '../lib/article-share';

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-article]')) {
    if (button.dataset.copyBound === 'true') continue;
    button.dataset.copyBound = 'true';

    const label = button.querySelector<HTMLElement>('[data-copy-label]');
    const status = button.parentElement?.querySelector<HTMLElement>('[data-copy-status]');
    let resetTimer: number | undefined;

    button.addEventListener('click', async () => {
      window.clearTimeout(resetTimer);
      button.disabled = true;

      try {
        const article = document.getElementById(button.dataset.targetId ?? '');
        if (!article) throw new Error('Article content not found');

        const url = new URL(window.location.href);
        url.hash = '';
        const payload = createArticleSharePayload(
          article,
          url.href,
          button.dataset.siteName ?? '巴菲特知识库',
        );
        await writeArticleShare(payload);
        if (label) label.textContent = '已复制';
        if (status) status.textContent = '文章已复制到剪贴板';
      } catch {
        if (label) label.textContent = '复制失败';
        if (status) status.textContent = '文章复制失败';
      }

      resetTimer = window.setTimeout(() => {
        if (label) label.textContent = '复制文章';
        button.disabled = false;
      }, 1800);
    });
  }
</script>

<style>
  .copy-article-control { display: inline-flex; align-items: center; }
  .copy-article-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-width: 7.5rem;
    min-height: 2.5rem;
    padding: 0.5rem 0.85rem;
    border: 1px solid #e7e1d4;
    border-radius: 6px;
    background: var(--panel);
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  .copy-article-button:hover { background: var(--accent-soft); }
  .copy-article-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .copy-article-button:disabled { cursor: default; opacity: 0.78; }
  .copy-article-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

- [ ] **Step 2: Type-check the component bundle through Astro**

Run:

```bash
npx astro check
```

Expected: exit code 0 with no errors in `CopyArticleButton.astro` or `article-share.ts`.

- [ ] **Step 3: Commit the reusable button**

```bash
git add site/src/components/CopyArticleButton.astro
git commit -m "Add article copy button component"
```

---

### Task 4: Render the button on both article templates

**Files:**
- Modify: `site/src/layouts/ArticleLayout.astro`
- Modify: `site/src/pages/sources/[group]/[slug].astro`

**Interfaces:**
- Consumes: `CopyArticleButton` from Task 3.
- Produces: `id="article-content"` as the shared target contract on both article templates.

- [ ] **Step 1: Integrate the button into editorial and keyword articles**

In `site/src/layouts/ArticleLayout.astro`, import the component:

```astro
import CopyArticleButton from '../components/CopyArticleButton.astro';
```

Add it to the existing `.views` toolbar:

```astro
<CopyArticleButton targetId="article-content" />
```

Add the target ID to the reading article:

```astro
<article id="article-content" data-view-pane="read" data-pagefind-body>
```

- [ ] **Step 2: Integrate the button into source articles**

In `site/src/pages/sources/[group]/[slug].astro`, import:

```astro
import CopyArticleButton from '../../../components/CopyArticleButton.astro';
```

Render a toolbar before the article and add the target ID:

```astro
<div class="article-tools">
  <CopyArticleButton targetId="article-content" />
</div>
<article id="article-content" class:list={{ 'letter-tables': hasLetterTables }} data-pagefind-body>
```

Append scoped layout CSS to the existing page style:

```css
.article-tools {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}
```

- [ ] **Step 3: Build and inspect both generated template families**

Run from `site/`:

```bash
npm run build
```

Expected: content validation, Astro generation, and Pagefind indexing succeed. Open one generated `/keywords/`, one `/articles/`, and one `/sources/` HTML file and confirm each has one `article-content` target and one copy control.

- [ ] **Step 4: Commit template integration**

```bash
git add site/src/layouts/ArticleLayout.astro 'site/src/pages/sources/[group]/[slug].astro'
git commit -m "Show copy controls on all articles"
```

---

### Task 5: Verify copying, responsiveness, and final quality

**Files:**
- Verify: `site/src/lib/article-share.ts`
- Verify: `site/src/components/CopyArticleButton.astro`
- Verify: `site/src/layouts/ArticleLayout.astro`
- Verify: `site/src/pages/sources/[group]/[slug].astro`
- Do not commit generated `site/dist/` or `site/public/images/` output.

**Interfaces:**
- Consumes: the complete feature from Tasks 1–4.
- Produces: automated, build, and browser evidence that the approved design works end to end.

- [ ] **Step 1: Run the full automated verification**

Run from `site/`:

```bash
npm test
npm run validate
npm run build
```

Expected: all tests pass, validation has no errors, and the production build plus Pagefind indexing complete successfully.

- [ ] **Step 2: Start the local server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Astro prints a local URL. Keep the process running for the remaining browser checks.

- [ ] **Step 3: Verify an editorial article at desktop and mobile sizes**

Open a `/keywords/` article at 1440×1000 and 390×844. Confirm the copy control stays inside the wrapping toolbar, does not overlap the title, preserves toolbar dimensions while its label changes, and remains keyboard focusable.

Click the button and paste into a rich-text contenteditable surface. Confirm the pasted content contains linked attribution at the top and bottom, retains the article heading, block quotes, lists, links, and any tables, and excludes the page toolbar, graph, sources, and sidebars.

- [ ] **Step 4: Verify a source article at desktop and mobile sizes**

Open a `/sources/` article with a table at 1440×1000 and 390×844. Confirm the right-aligned control does not cause horizontal overflow. Copy and paste into the same rich-text surface and confirm the table structure and both attribution blocks survive.

- [ ] **Step 5: Verify the plain-text fallback and failure state**

In browser developer tools, temporarily make `navigator.clipboard.write` unavailable while leaving `writeText` available. Click the button and confirm plain text is written with the same top/body/bottom order. Then block clipboard permission and confirm the label becomes “复制失败”, the page stays interactive, and no unhandled rejection appears.

- [ ] **Step 6: Stop the server and review the final diff**

Stop the dev server, then run from the repository root:

```bash
git status --short
git diff --check
```

Expected: no generated output is tracked, no whitespace errors are reported, and only intentional implementation/spec/plan files remain changed.

