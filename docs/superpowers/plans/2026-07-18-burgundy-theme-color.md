# Burgundy Theme Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the muted green site accent with the approved burgundy palette so headings, links, and interactive states stand out from body text.

**Architecture:** Keep the existing CSS cascade and component structure. Rename the global color tokens to semantic accent tokens, then migrate every UI reference while leaving the knowledge graph's categorical palette unchanged.

**Tech Stack:** Astro 5, component-scoped CSS, global CSS custom properties, Vitest, Pagefind

## Global Constraints

- Use `#842f3b` for `--accent`.
- Use `#f4e9e8` for `--accent-soft`.
- Keep the paper, panel, body text, muted text, quote rule, graph category colors, layout, typography, spacing, favicon, and image assets unchanged.
- Run all npm commands from `site/`.

---

### Task 1: Migrate the Site Accent Tokens

**Files:**
- Modify: `site/src/styles/tokens.css`
- Modify: `site/src/pages/index.astro`
- Modify: `site/src/layouts/ArticleLayout.astro`
- Modify: `site/src/components/Sidebar.astro`

**Interfaces:**
- Consumes: the existing global CSS custom properties imported by `BaseLayout.astro`
- Produces: `--accent: #842f3b` and `--accent-soft: #f4e9e8` for all site UI styles

- [ ] **Step 1: Record the current theme references**

Run:

```bash
cd site
rg -n -- '--green|--green-soft' src
```

Expected: references appear only in `tokens.css`, `index.astro`, `ArticleLayout.astro`, and `Sidebar.astro`.

- [ ] **Step 2: Replace the global tokens and their consumers**

Change the root variables in `site/src/styles/tokens.css` to:

```css
:root {
  --paper: #f7f4ed;
  --panel: #fffdf8;
  --text: #25302b;
  --text-muted: #6f756e;
  --accent: #842f3b;
  --accent-soft: #f4e9e8;
  --danger: #b3271e;
  --quote-rule: #9b7a44;
  --max-read: 720px;
}
```

Replace every `var(--green)` reference with `var(--accent)` and every `var(--green-soft)` reference with `var(--accent-soft)` in the four listed files. In `index.astro`, change the two green-specific comments to describe a theme-color rule and the site accent color without changing the rendered layout.

- [ ] **Step 3: Verify the semantic migration is complete**

Run:

```bash
cd site
rg -n -- '--green|--green-soft' src
```

Expected: no output and exit status `1`.

Run:

```bash
cd site
rg -n '#486b55|#edf3ea' src/styles src/pages src/layouts src/components --glob '!graph-client.ts'
```

Expected: no output and exit status `1`. The unchanged `#486b55` in `src/components/graph-client.ts` remains part of the graph category palette.

- [ ] **Step 4: Run automated verification**

Run:

```bash
cd site
npm test
```

Expected: all Vitest suites pass.

Run:

```bash
cd site
npm run build
```

Expected: content validation, Astro build, OG image generation, and Pagefind indexing finish successfully.

### Task 2: Check the Rendered Theme

**Files:**
- Verify: `site/src/pages/index.astro`
- Verify: `site/src/pages/sources/[group]/[slug].astro`

**Interfaces:**
- Consumes: the built global `--accent` and `--accent-soft` tokens from Task 1
- Produces: verified desktop and mobile rendering for the homepage and a long-form source page

- [ ] **Step 1: Start the development server**

Run:

```bash
cd site
npm run dev -- --host 127.0.0.1
```

Expected: Astro reports a local URL without CSS or content errors.

- [ ] **Step 2: Inspect the homepage at desktop and mobile widths**

Open `/` at `1440x900` and `390x844`. Confirm that the burgundy accent appears on the hero rules, section kickers, badges, counts, links, hover states, and focus outlines. Confirm that no text overlaps or shifts relative to the current layout.

- [ ] **Step 3: Inspect the supplied source-page example at desktop and mobile widths**

Open `/sources/meetings/2024nian-bo-ke-xi-er-gu-dong-da-hui` at `1440x900` and `390x844`. Confirm that the page title, `上午场` heading, auto-linked names, sidebar states, and dotted link underlines use `#842f3b`. Confirm that the body text remains `#25302b` and the pale accent background stays confined to hover, active, and quote states.

- [ ] **Step 4: Review the final diff and publish**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the plan and four approved style files are pending.

Commit and push:

```bash
git add docs/superpowers/plans/2026-07-18-burgundy-theme-color.md site/src/styles/tokens.css site/src/pages/index.astro site/src/layouts/ArticleLayout.astro site/src/components/Sidebar.astro
git commit -m "Update site accent to burgundy"
git push origin master
```
