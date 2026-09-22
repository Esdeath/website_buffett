import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getSourceBook, REPO_ROOT, validateSourceBook } from '../src/lib/source-book.ts';
import { renderSourceEntry, sourceEntryDisplayTitle, sourceEntryRepeatsHeading } from '../src/lib/source-book-render.ts';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));
const workRoot = join(REPO_ROOT, 'tmp/pdfs/buffett-yuanwen');
const modelPath = join(workRoot, 'book.json');
const siteUrl = 'https://buffett.ayaseeri.com';
const bundledPython = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
const python = process.env.SOURCE_BOOK_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python3');
const formats = new Set((process.argv.find((a) => a.startsWith('--format='))?.slice(9) ?? 'html,epub,pdf').split(','));
for (const format of formats) if (!['html', 'epub', 'pdf'].includes(format)) throw new Error(`未知格式 ${format}`);
let editorialNote;
const assetsByUrl = new Map();
const assetsByHash = new Map();
const missingImages = [];
mkdirSync(join(workRoot, 'book-images'), { recursive: true });

async function resolveAsset(url, source) {
  if (assetsByUrl.has(url)) return assetsByUrl.get(url);
  let bytes;
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
    if (!match) throw new Error(`无法识别图片 ${url.slice(0, 100)}`);
    bytes = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
  } else if (/^https?:\/\//.test(url)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`图片下载失败 ${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    const name = decodeURIComponent(basename(url.split(/[?#]/)[0]));
    const candidates = [join(siteRoot, 'public/images', name), join(REPO_ROOT, dirname(source.path), 'images', name),
      ...['berkshire', 'interview', 'shareholders'].map((group) => join(REPO_ROOT, 'buffett', group, 'images', name))];
    const path = candidates.find(existsSync);
    if (path) bytes = readFileSync(path);
    else {
      try {
        const response = process.argv.includes('--offline') ? null : await fetch(new URL(url, siteUrl), { signal: AbortSignal.timeout(6000) });
        if (response?.ok && response.headers.get('content-type')?.startsWith('image/')) bytes = Buffer.from(await response.arrayBuffer());
      } catch { /* Source assets are not always available on the published site. */ }
      if (!bytes) {
        missingImages.push({ url, source: source.path });
        const safeName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        bytes = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="180"><rect width="1000" height="180" fill="#f6f3ed"/><rect x="1" y="1" width="998" height="178" fill="none" stroke="#b7ada0"/><text x="500" y="66" text-anchor="middle" font-family="PingFang SC, sans-serif" font-size="28" fill="#58524a">编者注：原稿引用的图片文件缺失</text><text x="500" y="115" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" fill="#716b63">${safeName}</text></svg>`)).png().toBuffer();
        console.log(`原稿缺图（保留位置和文件名）：${name}`);
      }
    }
  }
  let format = (await sharp(bytes).metadata()).format;
  // EPUB core media types and ReportLab both support PNG/JPEG; keep original pixels.
  if (!['png', 'jpeg'].includes(format)) { bytes = await sharp(bytes).png().toBuffer(); format = 'png'; }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (!assetsByHash.has(hash)) {
    const id = `image-${hash.slice(0, 20)}`;
    const href = `book-images/${id}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    const path = join(workRoot, href);
    writeFileSync(path, bytes);
    assetsByHash.set(hash, { id, path, href, mediaType: `image/${format}`, hash });
  }
  const asset = assetsByHash.get(hash);
  assetsByUrl.set(url, asset);
  return asset;
}

const book = getSourceBook();
validateSourceBook(book);
editorialNote = `本书收录站内 ${book.stats.sourceCount} 篇原文，按主题安排为 ${book.parts.filter((part) => part.kind !== 'appendix').length} 篇正文与附录，共 ${book.sections.length} 个主题小节。每章先连续阅读各节的核心原文，依次理解问题、机制、实践和边界；其余同题材料集中在本章末，按年代排列，便于查考与比较。会务、原始资料说明、历史业绩表和重复版本另列附录。\n\n篇章结构、部分条目标题、阅读提示、导读与出处由编者整理；正文保留站内原稿的文字、提问、回答、译注及原有省略，书信不改写为问答。清洗去除的是编排层重复显示的标题与旧编号，原稿中的标题、文字和表格仍然保留。涉及多个主题的完整问答只收录一次，按主要论题归置。原稿中的其他发言者及署名一并保留。\n\n“原文不变”指与站内现有文本一致。HTML、PDF 和 EPUB 仅转换显示格式。`;
const renderedEntries = new Map();
let completed = 0;
for (const part of book.parts) for (const chapter of part.chapters) for (const section of chapter.sections) for (const entry of section.entries) {
  let html = await renderSourceEntry(entry);
  // These angle-bracketed names in the source are text, not HTML elements.
  html = html.replace(/<(Eli Broad|John Doerr|Gerry Lenfest|John Morgridge)>/g, (_, name) => `&lt;${name}&gt;`);
  const urls = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
  for (const encodedUrl of new Set(urls)) {
    const url = encodedUrl.replaceAll('&amp;', '&');
    const asset = await resolveAsset(url, entry.source);
    html = html.replaceAll(`src="${encodedUrl}"`, `src="${asset.href}"`);
  }
  html = html.replace(/\bhref="(\/[^\"]*)"/g, (_, url) => `href="${siteUrl}${url}"`);
  renderedEntries.set(entry.id, { id: entry.id, title: sourceEntryDisplayTitle(entry.title), showTitle: !sourceEntryRepeatsHeading(entry), html, hash: entry.hash,
    readingRole: entry.readingRole, readingStage: entry.readingStage, editorialReason: entry.editorialReason, duplicateOf: entry.duplicateOf,
    source: { title: entry.source.title, url: `${siteUrl}${entry.source.url}`, category: entry.source.category,
      year: entry.source.year, startLine: entry.startLine, endLine: entry.endLine } });
  if (++completed % 500 === 0) console.log(`原文排版：${completed}/${book.stats.entryCount}`);
}
if (missingImages.length) editorialNote += ` 原稿引用的 ${missingImages.length} 张图片文件未随资料保存，公开站点也未提供可用文件；导出保留其位置，并以编者注标出原文件名。其余图像均完整嵌入。`;
const model = { title: book.title, subtitle: book.subtitle, stats: book.stats, editorialNote, missingImages,
  revision: book.editorial?.revision, methodNotes: book.editorial?.methodNotes,
  assets: [...assetsByHash.values()],
  parts: book.parts.map((part) => ({ id: part.id, title: part.title, kind: part.kind, introduction: part.introduction,
    chapters: part.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, slug: chapter.slug, introduction: chapter.introduction,
      sections: chapter.sections.map((section) => ({ id: section.id, title: section.title, coreCount: section.coreCount,
        entries: section.entries.map((entry) => renderedEntries.get(entry.id)) })) })) })) };
writeFileSync(modelPath, JSON.stringify(model));
console.log(`✓ 排版模型：${book.stats.entryCount} 则原文，${model.assets.length} 张图片`);
if (!process.argv.includes('--model-only')) {
  const webFormats = [...formats].filter((f) => f !== 'pdf');
  if (webFormats.length) execFileSync(python, [join(siteRoot, 'scripts/render-source-book-web.py'), modelPath, `--format=${webFormats.join(',')}`], { cwd: siteRoot, stdio: 'inherit' });
  if (formats.has('pdf')) execFileSync(python, [join(siteRoot, 'scripts/render-source-book-pdf.py'), modelPath, join(REPO_ROOT, 'output/pdf/buffett-yuanwen.pdf')], { cwd: siteRoot, stdio: 'inherit' });
  for (const format of formats) {
    const path = join(REPO_ROOT, 'output', format, `buffett-yuanwen.${format}`);
    console.log(`✓ ${path} (${(statSync(path).size / 1024 / 1024).toFixed(2)} MB)`);
  }
}
