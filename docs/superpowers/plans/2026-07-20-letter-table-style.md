# Letter Table Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the selected annual-report table style to Markdown tables in shareholder and partner letters without changing other source categories or Markdown files.

**Architecture:** `site/src/lib/sources.ts` owns the category predicate so the scope has a small unit test. The source page uses that predicate to add one class to eligible articles, and page-local global CSS styles only tables below that class.

**Tech Stack:** Astro 5, TypeScript, Vitest, CSS

## Global Constraints

- Apply the style only to `致股东信` and `致合伙人信`.
- Do not modify Markdown files under `buffett/`.
- Keep the native Markdown table structure and existing horizontal scrolling.
- Keep interviews, shareholder meetings, editorial articles, SEO, URLs, and Pagefind behavior unchanged.
- Use the existing `--panel`, `--accent`, and `--accent-soft` theme tokens.
- Do not add dependencies.

---

### Task 1: Lock the category scope

**Files:**
- Modify: `site/src/lib/sources.ts:16-29`
- Create: `site/src/lib/source-table-style.test.ts`

**Interfaces:**
- Consumes: source category strings from content frontmatter.
- Produces: `usesLetterTableStyle(category: string): boolean` for source-page rendering.

- [ ] **Step 1: Write the failing scope test**

Create `site/src/lib/source-table-style.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { usesLetterTableStyle } from './sources';

describe('usesLetterTableStyle', () => {
  it.each(['致股东信', '致合伙人信'])('enables annual-report tables for %s', (category) => {
    expect(usesLetterTableStyle(category)).toBe(true);
  });

  it.each(['访谈与文章', '股东大会', '核心哲学', ''])('leaves %s unchanged', (category) => {
    expect(usesLetterTableStyle(category)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing export**

Run from `site/`:

```bash
npx vitest run src/lib/source-table-style.test.ts
```

Expected: FAIL because `./sources` does not export `usesLetterTableStyle`.

- [ ] **Step 3: Add the category predicate**

Add below `SOURCE_GROUP_SLUG` in `site/src/lib/sources.ts`:

```ts
const LETTER_TABLE_CATEGORIES = new Set(['致股东信', '致合伙人信']);

/** 仅信件类原文使用年报式 Markdown 表格。 */
export function usesLetterTableStyle(category: string): boolean {
  return LETTER_TABLE_CATEGORIES.has(category);
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npx vitest run src/lib/source-table-style.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit the tested scope helper**

```bash
git add site/src/lib/sources.ts site/src/lib/source-table-style.test.ts
git commit -m "Test letter table style scope"
```

---

### Task 2: Apply the annual-report table style

**Files:**
- Modify: `site/src/pages/sources/[group]/[slug].astro:3-61`
- Test: `site/src/lib/source-table-style.test.ts`

**Interfaces:**
- Consumes: `usesLetterTableStyle(category: string): boolean` from Task 1 and existing CSS tokens from `site/src/styles/tokens.css`.
- Produces: the `letter-tables` article class and its page-local table styles.

- [ ] **Step 1: Import and evaluate the scope predicate**

Change the import and add a derived boolean in `site/src/pages/sources/[group]/[slug].astro`:

```astro
import { getSourceGroups, usesLetterTableStyle } from '../../../lib/sources';
```

```ts
const { source, entry, groupName, groupFirstUrl } = Astro.props;
const hasLetterTables = usesLetterTableStyle(source.category);
const { Content } = await render(entry);
```

- [ ] **Step 2: Add the scoped article class**

Replace the opening article tag with:

```astro
<article class:list={{ 'letter-tables': hasLetterTables }} data-pagefind-body>
```

- [ ] **Step 3: Add the selected annual-report CSS**

Append this page-local style after `</BaseLayout>`:

```astro
<style is:global>
  .letter-tables table {
    width: 100%;
    margin: 1.5rem 0 2rem;
    border: 1px solid #d9d2c4;
    border-collapse: separate;
    border-spacing: 0;
    background: var(--panel);
    font-variant-numeric: tabular-nums lining-nums;
  }

  .letter-tables th,
  .letter-tables td {
    min-width: 6rem;
    padding: 0.7rem 0.8rem;
    vertical-align: middle;
  }

  .letter-tables th {
    border-bottom: 2px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
    line-height: 1.55;
  }

  .letter-tables th:not(:first-child),
  .letter-tables td:not(:first-child) {
    text-align: right;
  }

  .letter-tables th:first-child,
  .letter-tables td:first-child {
    min-width: 5rem;
    text-align: left;
  }

  .letter-tables tbody td {
    border-bottom: 1px solid #e7e1d4;
  }

  .letter-tables tbody tr:last-child td {
    border-bottom: 0;
  }

  @media (hover: hover) {
    .letter-tables tbody tr:hover td {
      background: #fbf4f2;
    }
  }

  @media (max-width: 767px) {
    .letter-tables th,
    .letter-tables td {
      min-width: 5.5rem;
      padding: 0.55rem 0.65rem;
    }

    .letter-tables th:first-child,
    .letter-tables td:first-child {
      min-width: 4.5rem;
    }
  }
</style>
```

- [ ] **Step 4: Run focused and full tests**

Run from `site/`:

```bash
npx vitest run src/lib/source-table-style.test.ts
npm test
```

Expected: the focused test and the full Vitest suite pass.

- [ ] **Step 5: Commit the table presentation**

```bash
git add 'site/src/pages/sources/[group]/[slug].astro'
git commit -m "Style tables in Buffett letters"
```

---

### Task 3: Verify content, build, and responsive rendering

**Files:**
- Verify: `site/src/pages/sources/[group]/[slug].astro`
- Verify: generated `site/dist/` output; do not commit it.

**Interfaces:**
- Consumes: the source-page output from Task 2.
- Produces: test, build, and visual evidence that the feature meets the design spec.

- [ ] **Step 1: Run the production build**

Run from `site/`:

```bash
npm run build
```

Expected: image sync, content validation, Astro build, and Pagefind indexing all finish with exit code 0.

- [ ] **Step 2: Start a local server**

Run from `site/`:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Astro reports a local URL. Keep this process running through the visual checks.

- [ ] **Step 3: Inspect an affected shareholder letter**

Open `/sources/letters/2024-ba-fei-te-zhi-gu-dong-xin` at 1440x1000 and 390x844. Confirm the shallow burgundy header, outer border, row rules, cell padding, right-aligned data, and horizontal scrolling without page-level overflow.

- [ ] **Step 4: Inspect an affected partner letter**

Open `/sources/partner-letters/1962nian-zhong-ba-fei-te-zhi-he-huo-ren-xin` at 1440x1000 and 390x844. Confirm that both narrow and wide tables use the same treatment and remain readable.

- [ ] **Step 5: Inspect an unaffected source table**

Open `/sources/interviews/ba-fei-te-1983nian-xiang-rose-blumkin-fa-chu-de-zheng-shi-yi-xiang-shou-gou-shu`. Confirm that its table retains the baseline site style and does not receive `letter-tables` presentation.

- [ ] **Step 6: Stop the local server and check the worktree**

Stop the dev server, then run:

```bash
git status --short
```

Expected: no tracked implementation changes remain uncommitted; `.superpowers/` may remain untracked from the approved visual comparison.
