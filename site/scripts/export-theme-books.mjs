#!/usr/bin/env node
/*
 * 按巴菲特站侧栏 7 个主题分别出书（EPUB + PDF）。
 *
 *   npm run book:themes                       # 全部 5 本新书
 *   npm run book:themes -- --only=buffett-interview,buffett-meetings
 *
 * 7 个主题里：
 *   - 原文主题全编、问答录 已有独立脚本（export:source-book / export:qa-book）
 *   - 选公司、访谈与文章、致股东信、致合伙人信、股东大会 由本脚本产出
 *
 * 做法：复用全编已排版好的书稿模型（tmp/pdfs/buffett-yuanwen/book.json），
 * 它在导出时已经把每则原文渲染成 HTML 并处理了图片；这里只按主题切片/重排，
 * 再走同一套 EPUB/PDF 渲染器，所以字体、封面、目录、来源索引与全编一致。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../src/lib/source-book.ts';
import { getDecisionBook } from '../src/lib/decision-book.ts';

const site = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(REPO_ROOT, 'output');
const workRoot = join(REPO_ROOT, 'tmp/pdfs/theme-books');
const sourceModelPath = join(REPO_ROOT, 'tmp/pdfs/buffett-yuanwen/book.json');
const python = process.env.SOURCE_BOOK_PYTHON
  ?? (existsSync(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'))
    ? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')
    : 'python3');

if (!existsSync(sourceModelPath)) {
  throw new Error(`缺少全编排版模型 ${sourceModelPath}，先运行 npm run export:source-book`);
}
const sourceModel = JSON.parse(readFileSync(sourceModelPath, 'utf8'));
const byId = new Map();
for (const part of sourceModel.parts) {
  for (const chapter of part.chapters) {
    for (const section of chapter.sections) {
      for (const entry of section.entries) byId.set(entry.id, entry);
    }
  }
}

const CATEGORY_BOOKS = [
  {
    slug: 'buffett-interview',
    category: '访谈与文章',
    title: '巴菲特访谈与文章',
    subtitle: '历年访谈、演讲与公开文章，按主题编排',
    note: '本书收录站内「访谈与文章」类的全部原文，按主题重新编排。正文保持站内原稿，标题、导读与出处为编排信息。',
  },
  {
    slug: 'buffett-shareholder-letters',
    category: '致股东信',
    title: '巴菲特致股东信',
    subtitle: '伯克希尔历年致股东信，按主题编排',
    note: '本书收录站内全部伯克希尔致股东信，按主题重新编排。正文保持站内原稿，标题、导读与出处为编排信息。',
  },
  {
    slug: 'buffett-partnership-letters',
    category: '致合伙人信',
    title: '巴菲特致合伙人信',
    subtitle: '合伙基金时期的致合伙人信，按主题编排',
    note: '本书收录站内全部合伙基金时期的致合伙人信，按主题重新编排。正文保持站内原稿，标题、导读与出处为编排信息。',
  },
  {
    slug: 'buffett-meetings',
    category: '股东大会',
    title: '巴菲特股东大会问答',
    subtitle: '伯克希尔股东大会问答实录，按主题编排',
    note: '本书收录站内全部股东大会问答实录，按主题重新编排。正文保持站内原稿，标题、导读与出处为编排信息。',
  },
];

const CHINESE_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十'];

function renumber(items, pattern, unit) {
  items.forEach((item, index) => {
    item.title = String(item.title).replace(pattern, `第${CHINESE_NUMBERS[index] ?? index + 1}${unit}`);
  });
}

function statsOf(entries) {
  const sources = new Map();
  for (const entry of entries) sources.set(entry.source.url, entry.source);
  return {
    sourceCount: sources.size,
    entryCount: entries.length,
    characterCount: entries.reduce((sum, entry) => sum + String(entry.html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length, 0),
    coreEntryCount: entries.filter((entry) => entry.readingRole === 'core').length,
    furtherEntryCount: entries.filter((entry) => entry.readingRole !== 'core').length,
  };
}

/** 按来源类别切分册：保留原书篇/章/节结构，只留该类别的已排版条目。 */
function sliceByCategory(model, spec) {
  const parts = [];
  for (const part of model.parts) {
    const chapters = [];
    for (const chapter of part.chapters) {
      const sections = chapter.sections
        .map((section) => ({ ...section, entries: section.entries.filter((entry) => entry.source?.category === spec.category) }))
        .filter((section) => section.entries.length);
      if (!sections.length) continue;
      chapters.push({ ...chapter, sections });
    }
    if (!chapters.length) continue;
    parts.push({ ...part, chapters });
  }
  if (!parts.length) throw new Error(`${spec.category}: 没有匹配到任何原文`);

  // 正文篇按顺序重编号；附录保留原标题（附录一/二…），不收进正文序号
  const bodyParts = parts.filter((part) => part.kind !== 'appendix');
  renumber(bodyParts, /^第.+?篇/, '篇');
  for (const part of bodyParts) renumber(part.chapters, /^第.+?章/, '章');
  const entries = parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.entries)));

  return {
    ...model,
    title: spec.title,
    subtitle: spec.subtitle,
    stats: statsOf(entries),
    editorialNote: spec.note,
    methodNotes: [
      `本书按主题编排，收录站内「${spec.category}」类原文的全部内容；每章先读核心原文，再按年代查考同题的延伸材料。`,
      '正文保持站内原稿，标题、导读、分类与出处为编排信息；同一段完整问答只收录一次。',
    ],
    assets: usedAssets(parts),
    parts,
  };
}

/** 选公司书：结构来自 decision book，正文复用全编已排版的条目。 */
function decisionModel() {
  const decision = getDecisionBook();
  const entries = [];
  const parts = decision.parts.map((part) => ({
    id: part.id,
    title: part.title,
    kind: part.kind,
    introduction: part.introduction,
    chapters: part.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      slug: chapter.slug,
      introduction: chapter.introduction,
      sections: chapter.sections.map((section) => ({
        id: section.id,
        title: section.title,
        coreCount: section.coreCount,
        entries: section.entries.map((entry) => {
          const rendered = byId.get(entry.id);
          if (!rendered) throw new Error(`全编模型缺少条目 ${entry.id}`);
          entries.push(rendered);
          return rendered;
        }),
      })),
    })),
  }));
  return {
    ...sourceModel,
    title: decision.title,
    subtitle: decision.subtitle,
    stats: statsOf(entries),
    editorialNote: '本书是围绕「怎样选择一家公司」的原文选读：篇目、排列顺序与导读为编者整理，正文保持原文，不构成机械的决策树。',
    methodNotes: decision.outline?.methodNotes ?? [],
    assets: usedAssets(parts),
    parts,
  };
}


/** 只保留本册条目实际引用的图片，避免每本分册都把全编的 100+ 张图打包进去。 */
function usedAssets(parts) {
  const used = new Set();
  for (const part of parts) for (const chapter of part.chapters) for (const section of chapter.sections) for (const entry of section.entries) {
    for (const match of String(entry.html ?? '').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) used.add(match[1]);
  }
  return sourceModel.assets.filter((asset) => used.has(asset.href));
}

function render(model, slug) {
  const modelPath = join(workRoot, `${slug}.json`);
  writeFileSync(modelPath, JSON.stringify(model));
  const epubPath = join(outputRoot, 'epub', `${slug}.epub`);
  const pdfPath = join(outputRoot, 'pdf', `${slug}.pdf`);
  console.log(`\n=== ${model.title}（${model.stats.sourceCount} 篇 / ${model.stats.entryCount} 则）===`);
  execFileSync(python, [join(site, 'scripts/render-source-book-web.py'), modelPath, '--format=epub', `--epub-out=${epubPath}`], { cwd: site, stdio: 'inherit' });
  execFileSync(python, [join(site, 'scripts/render-source-book-pdf.py'), modelPath, pdfPath], { cwd: site, stdio: 'inherit' });
  return { epubPath, pdfPath };
}

function main() {
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',').map((value) => value.trim()).filter(Boolean);
  mkdirSync(workRoot, { recursive: true });
  mkdirSync(join(outputRoot, 'epub'), { recursive: true });
  mkdirSync(join(outputRoot, 'pdf'), { recursive: true });

  const jobs = [
    { slug: 'buffett-xuan-gong-si', build: decisionModel },
    ...CATEGORY_BOOKS.map((spec) => ({ slug: spec.slug, build: () => sliceByCategory(sourceModel, spec) })),
  ];

  const results = [];
  for (const job of jobs) {
    if (only && !only.includes(job.slug)) continue;
    const model = job.build();
    results.push({ slug: job.slug, title: model.title, ...render(model, job.slug) });
  }
  console.log('\n完成：');
  for (const item of results) console.log(`  ✓ ${item.title}\n    ${item.epubPath}\n    ${item.pdfPath}`);
}

main();
