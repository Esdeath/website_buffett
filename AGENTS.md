

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

A Chinese-language Buffett knowledge base ("巴菲特知识库") published as an Astro static site. Two things live side by side:

- **Content** at the repo root: `buffett/` (Markdown source of truth) and `docs/` (registry + editorial docs).
- **The site app** in `site/` — an Astro project that reads the content via relative paths (`../buffett`, `../docs`). The site directory is itself a self-contained npm package; **run all commands from `site/`.**

Content is Chinese; all slugs/filenames are pinyin ASCII.

## Commands (run from `site/`)

- `npm run dev` — sync images, then Astro dev server.
- `npm run build` — sync images → `validate-content.mjs` (gate, fails build on error) → `astro build` → Pagefind search index. Produces `dist/`.
- `npm run preview` — preview the built `dist/`.
- `npm test` — Vitest (all colocated `*.test.ts` / `*.test.mjs`).
- Single test: `npx vitest run src/lib/registry.test.ts` (or `npx vitest run -t "name"`).
- `npm run validate` — run content validation alone (frontmatter, slug consistency, dead links).
- `npm run sync:images` — flatten `buffett/<group>/images/` → `site/public/images/`.
- `npm run build:og-font` — regenerate the OG-image font subset (only needed when title glyphs change).

Deploy: Cloudflare Pages, root dir `site`, build `npm run build`, output `dist`, `NODE_VERSION=22`. The real domain is set in `astro.config.mjs` (`site:`).

## Architecture

### Content model — two collections (`site/src/content.config.ts`)

1. **`articles`** — editorial/interpretive pieces in `buffett/articles/<dir>/*.md`. Seven `type`s, one per directory: `keyword`, `company`, `industry`, `person`, `question`, `timeline`, `category-overview` (directory names are plural; `src/lib/url.ts` maps dir↔type).
2. **`sources`** — primary materials in `buffett/{berkshire,interview,shareholders}/**`: shareholder/partner letters, interviews & articles, and annual-meeting transcripts. No `type`; grouped by `category`, ordered by `order`.

### The keyword registry is the source of truth

`docs/keyword-registry.md` is a Markdown table (keyword | slug | category | path | aliases | status) parsed by `src/lib/registry.ts`. It is the canonical authority for **category assignment, canonical URLs, and keyword/alias resolution**. A `keyword` article that isn't registered there will fail validation (assembly would otherwise mis-bucket it).

### Cross-linking (remark plugins, wired in `astro.config.mjs`)

- `remark-wikilink.mjs` — resolves `[[关键词]]` / `[[关键词|显示]]` against the registry. **A dead wikilink throws and breaks the build.** Used everywhere.
- `remark-autolink.mjs` — auto-links *bare* registry keywords, but **only in source files** (`berkshire|interview|shareholders`), first-occurrence-only, longest-match-first. Editorial articles use explicit `[[ ]]` instead.
- `remark-strip-source-title.mjs` — strips the leading H1 from source files (title comes from frontmatter).

### URL conventions (`src/lib/url.ts`, `articles.ts`, `sources.ts`)

- `keyword` → `/keywords/<slug>`; other article types → `/articles/<type>/<slug>`; sources → `/sources/<group>/<slug>`.
- `CATEGORY_SLUG` (articles.ts) and `SOURCE_GROUP_SLUG` (sources.ts) are the single source of truth for both **display order** and the ASCII slug of each category/group.
- Invariant enforced by validation: filename === frontmatter `slug`, and slugs are unique.

### Data assembly & derived data

`src/lib/articles.ts` `load()` joins the collection with the registry into the `Article` model behind a module-level cache, then builds **backlinks** (`backlinks.ts`, from `[[ ]]` targets) and the **knowledge graph** (`graph.ts`). Pages (`src/pages/`) and components (`Backlinks`, `GraphView`, `KeywordPanel`, `SourcePanel`, …) consume these. Graph is rendered client-side with Cytoscape.

### Generated build outputs

- Pagefind search index (powers `/search`).
- One 1200×630 OG image per page via `astro-og-canvas` at `/og/<key>.png` (key = page path; see `lib/seo.ts` `ogKey`). Requires the subset font in `src/assets/`.
- `llms.txt` / `llms-full.txt` and a sitemap.
- `site/public/images/` — flattened from `buffett/**/images/` by `sync-images.mjs`; **generated and gitignored — edit the originals under `buffett/`.**

### Tests

Vitest, colocated next to sources. `astro:content` is mocked via `src/lib/__mocks__/astro-content.ts` (aliased in `vitest.config.ts`) so lib functions can be unit-tested without the Astro runtime.

## Gotchas when editing content

- Adding/renaming a keyword article requires a matching row in `docs/keyword-registry.md`, or the build fails.
- Every `[[...]]` must resolve in the registry — including ones inside source texts.
- `validate-content.mjs` also *warns* (non-fatal) when a keyword article lacks a `docs/source-matrices/<slug>.md` or `docs/quote-cards/<slug>.md` companion.
- Editorial planning/spec docs live in `docs/superpowers/{plans,specs}/`.
