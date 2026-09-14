import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import sharp from 'sharp';
import {
  assembleQaBook,
  loadQaManifest,
  loadQaSources,
  qaQuestionNumber,
  qaSourceVenueLabel,
  qaStatusLabel,
} from '../src/lib/qa-book.ts';
import { validateQaBook } from '../src/lib/qa-book-validation.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const siteRoot = fileURLToPath(new URL('../', import.meta.url));
const bookRoot = join(repoRoot, 'buffett/books/buffett-wenda-lu');
const questionsRoot = join(bookRoot, 'questions');
const sourceCoverPath = join(bookRoot, 'assets/cover.webp');
const outputRoot = join(repoRoot, 'output');
const htmlOutputPath = join(outputRoot, 'html/buffett-wenda-lu.html');
const epubOutputPath = join(outputRoot, 'epub/buffett-wenda-lu.epub');
const pdfOutputPath = join(outputRoot, 'pdf/buffett-wenda-lu.pdf');
const htmlTempPath = join(outputRoot, 'html/.buffett-wenda-lu.tmp.html');
const epubTempPath = join(outputRoot, 'epub/.buffett-wenda-lu.tmp.epub');
const pdfTempPath = join(outputRoot, 'pdf/.buffett-wenda-lu.tmp.pdf');
const epubWorkRoot = join(repoRoot, 'tmp/qa-book-epub');
const pdfWorkRoot = join(repoRoot, 'tmp/pdfs/buffett-wenda-lu');
const coverWorkPath = join(pdfWorkRoot, 'cover.jpg');
const pdfModelPath = join(pdfWorkRoot, 'book.json');
const pdfRendererPath = join(siteRoot, 'scripts/render-qa-book-pdf.py');
const siteUrl = 'https://buffett.ayaseeri.com';
const fixedZipTime = new Date('2000-01-01T00:00:00Z');

const speakerNames = {
  'warren-buffett': '沃伦·巴菲特',
  'charlie-munger': '查理·芒格',
  'greg-abel': '格雷格·阿贝尔',
  'ajit-jain': '阿吉特·贾恩',
};

const formatArgument = process.argv.find((argument) => argument.startsWith('--format='));
const requestedFormats = new Set(
  formatArgument
    ? formatArgument.slice('--format='.length).split(',').map((format) => format.trim())
    : ['html', 'epub', 'pdf'],
);
const knownFormats = new Set(['html', 'epub', 'pdf']);
for (const format of requestedFormats) {
  if (!knownFormats.has(format)) {
    throw new Error(`不支持的导出格式：${format}。可用格式：html、epub、pdf。`);
  }
}

function walkMarkdown(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walkMarkdown(path) : entry.name.endsWith('.md') ? [path] : [];
    })
    .sort();
}

function parseQuestion(path) {
  const text = readFileSync(path, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`${path}: 缺少 YAML frontmatter`);
  const data = parseYaml(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${path}: frontmatter 必须是对象`);
  }
  return { filePath: path, data, body: text.slice(match[0].length) };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
}

function markdownParagraphs(value) {
  return value
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .filter(Boolean)
    .map((paragraph) => `<p>${inlineMarkdown(paragraph).replaceAll('\n', '<br />')}</p>`)
    .join('\n');
}

function absoluteSiteUrl(path) {
  return new URL(path, `${siteUrl}/`).href;
}

function questionSource(question) {
  const internalUrl = absoluteSiteUrl(
    `${question.source.internalUrl}#${question.sourceStartAnchor}`,
  );
  const externalUrl = question.externalLocator.url ?? question.source.englishUrl;
  return {
    year: question.source.year,
    venue: qaSourceVenueLabel(question.source),
    internalUrl,
    externalUrl,
    locator: question.externalLocator.label ?? '',
    speakers: question.speakers.map((speaker) => speakerNames[speaker] ?? speaker).join('、'),
    status: qaStatusLabel(question.status),
  };
}

function renderSourceHtml(question) {
  const source = questionSource(question);
  const external = source.externalUrl
    ? `<a href="${escapeHtml(source.externalUrl)}">英文核验来源</a>`
    : '';
  const links = [
    `<a href="${escapeHtml(source.internalUrl)}">站内中文原文</a>`,
    external,
  ].filter(Boolean).join('<span aria-hidden="true"> · </span>');
  const locator = source.locator ? `<span>${escapeHtml(source.locator)}</span>` : '';
  return `
    <footer class="question-source">
      <p><strong>${source.year} · ${escapeHtml(source.venue)}</strong><span aria-hidden="true"> · </span>${links}</p>
      ${locator ? `<p>${locator}</p>` : ''}
      <p>回答者：${escapeHtml(source.speakers)} · 版本：${escapeHtml(source.status)}</p>
    </footer>`;
}

function movementAnchor(chapter, movement) {
  return `${chapter.id}-${movement.id}`;
}

function renderQuestionHtml(question) {
  const number = qaQuestionNumber(question);
  return `
    <section class="question" id="${question.id}">
      <p class="question-number">第 ${number} 问</p>
      <h4>${escapeHtml(question.title)}</h4>
      <div class="source-question">
        <p class="source-question-label">原始提问</p>
        <p>${escapeHtml(question.sourceQuestion.trim())}</p>
      </div>
      <div class="answer">${markdownParagraphs(question.body)}</div>
      ${renderSourceHtml(question)}
    </section>`;
}

function renderChapterHtml(chapter, { epub = false } = {}) {
  const movements = chapter.movements.map((movement) => {
    const questions = chapter.questions
      .filter((question) => question.movement.id === movement.id)
      .map(renderQuestionHtml)
      .join('\n');
    return `
      <section class="movement" id="${movementAnchor(chapter, movement)}">
        <p class="movement-number">第 ${movement.order} 节</p>
        <h3>${escapeHtml(movement.title)}</h3>
        ${questions}
      </section>`;
  }).join('\n');

  const closing = chapter.closing
    ? `<aside class="editor-bridge"><strong>编者过桥</strong><p>${escapeHtml(chapter.closing)}</p></aside>`
    : '';
  return `
    <article class="chapter" id="${chapter.id}">
      <header class="chapter-header">
        <p class="chapter-number">第 ${chapter.order} 章 · 30 问</p>
        <h2>${escapeHtml(chapter.title)}</h2>
        <p class="chapter-subtitle">${escapeHtml(chapter.subtitle)}</p>
        <aside class="editor-note"><strong>编者导读</strong><p>${escapeHtml(chapter.introduction)}</p></aside>
      </header>
      ${movements}
      ${closing}
      ${epub ? '' : '<p class="back-to-toc"><a href="#toc">返回目录</a></p>'}
    </article>`;
}

function renderHtmlToc(book) {
  const parts = book.parts.map((part) => `
    <li>
      <span class="toc-part">第 ${part.order} 篇 ${escapeHtml(part.title)}</span>
      <ol>
        ${part.chapters.map((chapter) => `
          <li>
            <a href="#${chapter.id}">第 ${chapter.order} 章 ${escapeHtml(chapter.title)}</a>
            <ol class="toc-movements">
              ${chapter.movements.map((movement) => `<li><a href="#${movementAnchor(chapter, movement)}">${escapeHtml(movement.title)}</a></li>`).join('')}
            </ol>
          </li>`).join('')}
      </ol>
    </li>`).join('');
  return `<nav class="book-toc" id="toc" aria-labelledby="toc-title"><h2 id="toc-title">目录</h2><ol>${parts}</ol></nav>`;
}

function renderPartHtml(part) {
  return `
    <section class="part-page" id="${part.id}">
      <p>第 ${part.order} 篇</p>
      <h2>${escapeHtml(part.title)}</h2>
      <ol>${part.chapters.map((chapter) => `<li><a href="#${chapter.id}">${escapeHtml(chapter.title)}</a></li>`).join('')}</ol>
    </section>`;
}

const htmlStyles = `
  :root { color-scheme: light; --paper: #f4efe7; --page: #fffdfa; --ink: #2c2925; --muted: #716a62; --line: #d9d0c5; --accent: #9b4438; --soft: #f7f1eb; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, serif; font-size: 18px; line-height: 1.9; }
  a { color: var(--accent); text-underline-offset: 0.2em; }
  .cover { min-height: 100vh; display: grid; place-items: center; padding: 48px 24px; background: #ebe3d9; }
  .cover img { display: block; width: min(100%, 640px); height: auto; box-shadow: 0 20px 56px rgb(59 43 31 / 18%); }
  .reading-shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; display: grid; grid-template-columns: minmax(230px, 290px) minmax(0, 760px); gap: 64px; align-items: start; }
  .book-toc { position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow: auto; padding: 48px 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 14px; line-height: 1.6; }
  .book-toc h2 { font-family: inherit; font-size: 24px; margin: 0 0 20px; }
  .book-toc ol { margin: 0; padding-left: 1.3em; }
  .book-toc > ol { padding-left: 0; list-style: none; }
  .book-toc > ol > li { margin-bottom: 18px; }
  .book-toc a { color: var(--ink); text-decoration: none; }
  .book-toc a:hover { color: var(--accent); }
  .toc-part { color: var(--accent); font-weight: 700; }
  .toc-movements { color: var(--muted); }
  .book { min-width: 0; background: var(--page); padding: 72px clamp(28px, 7vw, 84px) 96px; box-shadow: 0 0 0 1px rgb(120 91 66 / 8%); }
  .editorial-preface { padding-bottom: 64px; border-bottom: 1px solid var(--line); }
  .editorial-preface h1 { margin: 0; font-size: 54px; line-height: 1.25; }
  .editorial-preface .subtitle { color: var(--accent); font-size: 21px; }
  .part-page { min-height: 62vh; display: flex; flex-direction: column; justify-content: center; border-top: 8px solid var(--accent); margin: 88px 0; padding: 52px 0; }
  .part-page > p, .chapter-number, .movement-number, .question-number { color: var(--accent); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-weight: 700; }
  .part-page h2 { margin: 0 0 28px; font-size: 46px; line-height: 1.25; }
  .part-page ol { margin: 0; padding-left: 1.5em; }
  .chapter { scroll-margin-top: 24px; }
  .chapter + .part-page, .chapter + .chapter { margin-top: 100px; }
  .chapter-header { padding-top: 24px; }
  .chapter-header h2 { margin: 8px 0; font-size: 38px; line-height: 1.35; }
  .chapter-subtitle { margin-top: 0; color: var(--muted); font-size: 20px; }
  .editor-note, .editor-bridge { margin: 36px 0 56px; padding: 22px 24px; border-left: 3px solid var(--accent); background: var(--soft); }
  .editor-note p, .editor-bridge p { margin: 4px 0 0; }
  .movement { scroll-margin-top: 24px; margin: 72px 0 0; }
  .movement > h3 { margin: 4px 0 28px; font-size: 29px; line-height: 1.35; }
  .question { scroll-margin-top: 24px; padding: 44px 0; border-top: 1px solid var(--line); }
  .question-number { margin: 0 0 4px; font-size: 14px; }
  .question h4 { margin: 0 0 24px; font-size: 25px; line-height: 1.45; }
  .source-question { margin: 0 0 30px; padding: 18px 22px; border-left: 3px solid #bdb2a5; background: #faf7f3; }
  .source-question p { margin: 0; }
  .source-question-label { color: var(--muted); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-size: 13px; font-weight: 700; }
  .answer p { margin: 0 0 1em; text-align: justify; text-justify: inter-ideograph; }
  .answer strong { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .question-source { margin-top: 30px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-size: 13px; line-height: 1.7; }
  .question-source p { margin: 3px 0; }
  .back-to-toc { text-align: right; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-size: 13px; }
  .colophon { margin-top: 100px; padding-top: 32px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
  @media (max-width: 860px) {
    body { font-size: 17px; }
    .reading-shell { width: min(100%, 760px); display: block; }
    .book-toc { position: static; max-height: none; padding: 36px 28px; }
    .book { padding: 52px 28px 72px; box-shadow: none; }
    .cover { min-height: auto; padding: 24px 16px; }
    .editorial-preface h1 { font-size: 36px; }
    .chapter-header h2 { font-size: 31px; }
    .part-page h2 { font-size: 38px; }
    .toc-movements { display: none; }
  }
  @media print {
    @page { size: A5; margin: 17mm 15mm 19mm; }
    body { background: white; font-size: 10.5pt; line-height: 1.65; }
    .cover { min-height: 0; height: 210mm; padding: 0; break-after: page; }
    .cover img { width: 148mm; height: 210mm; object-fit: cover; box-shadow: none; }
    .reading-shell { display: block; width: auto; }
    .book-toc { position: static; max-height: none; break-after: page; padding: 0; }
    .book { padding: 0; box-shadow: none; }
    .part-page, .chapter { break-before: page; }
    .question h4, .movement h3 { break-after: avoid; }
    .question { break-inside: auto; }
    .back-to-toc { display: none; }
    a { color: inherit; text-decoration: none; }
  }`;

function renderStandaloneHtml(book, coverDataUri) {
  const content = book.parts.map((part) => [
    renderPartHtml(part),
    ...part.chapters.map((chapter) => renderChapterHtml(chapter)),
  ].join('\n')).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="author" content="巴菲特知识库编辑部" />
  <meta name="description" content="${escapeHtml(book.manifest.subtitle)}" />
  <title>${escapeHtml(book.manifest.title)}｜${escapeHtml(book.manifest.subtitle)}</title>
  <style>${htmlStyles}</style>
</head>
<body>
  <header class="cover"><img src="${coverDataUri}" alt="${escapeHtml(book.manifest.title)}封面" /></header>
  <div class="reading-shell">
    ${renderHtmlToc(book)}
    <main class="book">
      <section class="editorial-preface">
        <h1>${escapeHtml(book.manifest.title)}</h1>
        <p class="subtitle">${escapeHtml(book.manifest.subtitle)}</p>
        <p>全书共 4 篇、10 章、50 节、300 问。回答选自伯克希尔股东大会与可靠访谈，保留站内中文原文及英文核验来源。</p>
        <p><strong>编选说明</strong> 本书是对站内中文译稿与整理稿的轻度精编，不是官方中文逐字稿。编辑仅删去寒暄、口语重复与无关串场；非连续删节以“[…]”标示，其他回答者始终单独署名。</p>
      </section>
      ${content}
      <footer class="colophon"><p>巴菲特知识库编辑部编选 · ${escapeHtml(siteUrl)}</p></footer>
    </main>
  </div>
</body>
</html>\n`;
}

const epubStyles = `
  body { margin: 5%; color: #2c2925; font-family: serif; line-height: 1.75; }
  a { color: #8f3e34; }
  h1, h2, h3, h4, .question-number, .chapter-number, .movement-number, .source-question-label, .question-source { font-family: sans-serif; }
  h1, h2, h3, h4 { line-height: 1.35; }
  .cover-page { margin: 0; padding: 0; text-align: center; }
  .cover-page img { display: block; width: 100%; height: auto; }
  .title-page, .part-page { text-align: center; padding-top: 28%; }
  .title-page h1 { font-size: 2.3em; }
  .subtitle, .chapter-subtitle { color: #6f675f; }
  nav ol { padding-left: 1.4em; }
  .chapter-header { page-break-before: always; }
  .editor-note, .editor-bridge { margin: 1.8em 0; padding: 0.9em 1em; border-left: 0.2em solid #9b4438; background: #f7f1eb; }
  .editor-note p, .editor-bridge p { margin: 0.3em 0 0; }
  .movement { margin-top: 2.8em; }
  .question { margin-top: 2em; padding-top: 1.6em; border-top: 0.06em solid #d9d0c5; }
  .question-number, .chapter-number, .movement-number { margin: 0; color: #9b4438; font-size: 0.8em; font-weight: bold; }
  .question h4 { margin-top: 0.25em; }
  .source-question { margin: 1em 0; padding: 0.8em 1em; border-left: 0.18em solid #bdb2a5; background: #faf7f3; }
  .source-question p { margin: 0; }
  .source-question-label { color: #6f675f; font-size: 0.78em; font-weight: bold; }
  .answer p { margin: 0 0 0.9em; text-align: justify; }
  .question-source { margin-top: 1.3em; padding-top: 0.8em; border-top: 0.06em solid #d9d0c5; color: #6f675f; font-size: 0.72em; }
  .question-source p { margin: 0.2em 0; }
  .part-page ol { text-align: left; display: inline-block; }
  .colophon { margin-top: 25%; text-align: center; color: #6f675f; }
`;

function xhtmlDocument(title, body, { cssPath = '../styles/book.css', bodyClass = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="${cssPath}" />
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>\n`;
}

function epubChapterFile(chapter) {
  return `chapter-${String(chapter.order).padStart(2, '0')}.xhtml`;
}

function renderEpubNav(book) {
  const parts = book.parts.map((part) => `
    <li><a href="text/part-${part.order}.xhtml">第 ${part.order} 篇 ${escapeHtml(part.title)}</a>
      <ol>${part.chapters.map((chapter) => `
        <li><a href="text/${epubChapterFile(chapter)}#${chapter.id}">第 ${chapter.order} 章 ${escapeHtml(chapter.title)}</a>
          <ol>${chapter.movements.map((movement) => `<li><a href="text/${epubChapterFile(chapter)}#${movementAnchor(chapter, movement)}">${escapeHtml(movement.title)}</a></li>`).join('')}</ol>
        </li>`).join('')}
      </ol>
    </li>`).join('');
  return xhtmlDocument('目录', `
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>${parts}</ol>
  </nav>
  <nav epub:type="landmarks" hidden="hidden">
    <h2>导航</h2>
    <ol>
      <li><a epub:type="cover" href="text/cover.xhtml">封面</a></li>
      <li><a epub:type="titlepage" href="text/titlepage.xhtml">书名页</a></li>
      <li><a epub:type="toc" href="nav.xhtml#toc">目录</a></li>
      <li><a epub:type="bodymatter" href="text/chapter-01.xhtml">正文</a></li>
    </ol>
  </nav>`, { cssPath: 'styles/book.css' });
}

function renderNcx(book, identifier) {
  let playOrder = 1;
  const points = [];
  for (const part of book.parts) {
    const partOrder = playOrder++;
    const chapters = part.chapters.map((chapter) => {
      const chapterOrder = playOrder++;
      const movements = chapter.movements.map((movement) => {
        const movementOrder = playOrder++;
        return `<navPoint id="nav-${chapter.id}-${movement.id}" playOrder="${movementOrder}"><navLabel><text>${escapeHtml(movement.title)}</text></navLabel><content src="text/${epubChapterFile(chapter)}#${movementAnchor(chapter, movement)}" /></navPoint>`;
      }).join('');
      return `<navPoint id="nav-${chapter.id}" playOrder="${chapterOrder}"><navLabel><text>第 ${chapter.order} 章 ${escapeHtml(chapter.title)}</text></navLabel><content src="text/${epubChapterFile(chapter)}#${chapter.id}" />${movements}</navPoint>`;
    }).join('');
    points.push(`<navPoint id="nav-${part.id}" playOrder="${partOrder}"><navLabel><text>第 ${part.order} 篇 ${escapeHtml(part.title)}</text></navLabel><content src="text/part-${part.order}.xhtml" />${chapters}</navPoint>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh-CN">
  <head><meta name="dtb:uid" content="${escapeHtml(identifier)}" /><meta name="dtb:depth" content="3" /></head>
  <docTitle><text>${escapeHtml(book.manifest.title)}</text></docTitle>
  <navMap>${points.join('')}</navMap>
</ncx>\n`;
}

function renderOpf(book, modified) {
  const identifier = `${siteUrl}/books/buffett-wenda-lu/`;
  const chapterItems = book.chapters.map((chapter) => `    <item id="chapter-${chapter.order}" href="text/${epubChapterFile(chapter)}" media-type="application/xhtml+xml" />`).join('\n');
  const partItems = book.parts.map((part) => `    <item id="part-${part.order}" href="text/part-${part.order}.xhtml" media-type="application/xhtml+xml" />`).join('\n');
  const spine = book.parts.map((part) => [
    `    <itemref idref="part-${part.order}" />`,
    ...part.chapters.map((chapter) => `    <itemref idref="chapter-${chapter.order}" />`),
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" prefix="schema: http://schema.org/" version="3.0" unique-identifier="pub-id" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeHtml(identifier)}</dc:identifier>
    <dc:title>${escapeHtml(book.manifest.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:subject>沃伦·巴菲特</dc:subject>
    <dc:description>${escapeHtml(book.manifest.subtitle)}</dc:description>
    <dc:creator id="speaker-buffett">沃伦·巴菲特</dc:creator>
    <meta refines="#speaker-buffett" property="role" scheme="marc:relators">spk</meta>
    <dc:contributor id="speaker-munger">查理·芒格</dc:contributor>
    <meta refines="#speaker-munger" property="role" scheme="marc:relators">spk</meta>
    <dc:contributor id="editor">巴菲特知识库编辑部</dc:contributor>
    <meta refines="#editor" property="role" scheme="marc:relators">edt</meta>
    <dc:publisher>巴菲特知识库</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta name="cover" content="cover-image" />
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="css" href="styles/book.css" media-type="text/css" />
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image" />
    <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml" />
    <item id="titlepage" href="text/titlepage.xhtml" media-type="application/xhtml+xml" />
    <item id="editor-note" href="text/editor-note.xhtml" media-type="application/xhtml+xml" />
${partItems}
${chapterItems}
    <item id="colophon" href="text/colophon.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine toc="ncx" page-progression-direction="ltr">
    <itemref idref="cover" linear="no" />
    <itemref idref="titlepage" />
    <itemref idref="editor-note" />
    <itemref idref="nav" linear="no" />
${spine}
    <itemref idref="colophon" />
  </spine>
</package>\n`;
}

function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function setTreeMtime(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) setTreeMtime(path);
    utimesSync(path, fixedZipTime, fixedZipTime);
  }
  utimesSync(directory, fixedZipTime, fixedZipTime);
}

async function createPortraitCover(outputPath, book) {
  const image = await sharp(sourceCoverPath)
    .resize(1600, 1100, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const overlay = Buffer.from(`
    <svg width="1600" height="2400" xmlns="http://www.w3.org/2000/svg">
      <rect y="1100" width="1600" height="12" fill="#9b4438" />
      <text x="800" y="1330" text-anchor="middle" font-family="PingFang SC, sans-serif" font-size="40" font-weight="600" fill="#9b4438">巴菲特知识库 编选</text>
      <text x="800" y="1580" text-anchor="middle" font-family="Songti SC, STSong, serif" font-size="132" font-weight="700" fill="#2c2925">${escapeHtml(book.manifest.title)}</text>
      <text x="800" y="1755" text-anchor="middle" font-family="Songti SC, STSong, serif" font-size="54" fill="#514b45">300 个问题</text>
      <text x="800" y="1840" text-anchor="middle" font-family="Songti SC, STSong, serif" font-size="54" fill="#514b45">从一笔投资问到怎样过一生</text>
      <line x1="560" x2="1040" y1="1980" y2="1980" stroke="#c8baaa" stroke-width="3" />
      <text x="800" y="2130" text-anchor="middle" font-family="PingFang SC, sans-serif" font-size="38" fill="#716a62">4 篇 · 10 章 · 50 节 · 300 问</text>
    </svg>`);
  mkdirSync(dirname(outputPath), { recursive: true });
  await sharp({ create: { width: 1600, height: 2400, channels: 3, background: '#f4efe7' } })
    .composite([{ input: image, left: 0, top: 0 }, { input: overlay, left: 0, top: 0 }])
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);
}

function exportHtml(book) {
  const cover = readFileSync(coverWorkPath).toString('base64');
  const html = renderStandaloneHtml(book, `data:image/jpeg;base64,${cover}`);
  writeText(htmlTempPath, html);
  const anchors = [...html.matchAll(/<section class="question" id="(q\d{3})">/g)].map((match) => match[1]);
  if (anchors.length !== 300 || new Set(anchors).size !== 300) {
    throw new Error(`HTML 问题锚点异常：共 ${anchors.length} 个，唯一 ${new Set(anchors).size} 个。`);
  }
  if (html.includes('href="/sources/')) throw new Error('HTML 中存在无法离线使用的相对来源链接。');
  renameSync(htmlTempPath, htmlOutputPath);
  console.log(`✓ HTML：${htmlOutputPath}`);
}

function exportEpub(book) {
  rmSync(epubWorkRoot, { recursive: true, force: true });
  rmSync(epubTempPath, { force: true });
  const metaInf = join(epubWorkRoot, 'META-INF');
  const epubRoot = join(epubWorkRoot, 'EPUB');
  const textRoot = join(epubRoot, 'text');
  mkdirSync(join(epubRoot, 'images'), { recursive: true });
  mkdirSync(join(epubRoot, 'styles'), { recursive: true });
  mkdirSync(metaInf, { recursive: true });
  mkdirSync(textRoot, { recursive: true });

  writeText(join(epubWorkRoot, 'mimetype'), 'application/epub+zip');
  writeText(join(metaInf, 'container.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>\n`);
  writeText(join(epubRoot, 'styles/book.css'), epubStyles.trimStart());
  writeFileSync(join(epubRoot, 'images/cover.jpg'), readFileSync(coverWorkPath));
  writeText(join(textRoot, 'cover.xhtml'), xhtmlDocument('封面', '<section class="cover-page" epub:type="cover"><img src="../images/cover.jpg" alt="巴菲特问答录封面" /></section>', { bodyClass: 'cover-page' }));
  writeText(join(textRoot, 'titlepage.xhtml'), xhtmlDocument('书名页', `<section class="title-page" epub:type="titlepage"><h1>${escapeHtml(book.manifest.title)}</h1><p class="subtitle">${escapeHtml(book.manifest.subtitle)}</p><p>巴菲特知识库编辑部 编选</p></section>`));
  writeText(join(textRoot, 'editor-note.xhtml'), xhtmlDocument('编选说明', '<section><h1>编选说明</h1><p>本书是对站内中文译稿与整理稿的轻度精编，不是官方中文逐字稿。编辑仅删去寒暄、口语重复与无关串场；非连续删节以“[…]”标示，其他回答者始终单独署名。</p><p>全书共 4 篇、10 章、50 节、300 问。每条问答均保留站内中文原文及英文核验来源。</p></section>'));

  for (const part of book.parts) {
    const chapterLinks = part.chapters.map((chapter) => `<li><a href="${epubChapterFile(chapter)}#${chapter.id}">第 ${chapter.order} 章 ${escapeHtml(chapter.title)}</a></li>`).join('');
    writeText(join(textRoot, `part-${part.order}.xhtml`), xhtmlDocument(`第 ${part.order} 篇 ${part.title}`, `<section class="part-page"><p>第 ${part.order} 篇</p><h1>${escapeHtml(part.title)}</h1><ol>${chapterLinks}</ol></section>`));
  }
  for (const chapter of book.chapters) {
    writeText(join(textRoot, epubChapterFile(chapter)), xhtmlDocument(`第 ${chapter.order} 章 ${chapter.title}`, renderChapterHtml(chapter, { epub: true })));
  }
  writeText(join(textRoot, 'colophon.xhtml'), xhtmlDocument('版权与来源说明', `<section class="colophon"><h1>版权与来源说明</h1><p>巴菲特知识库编辑部编选。</p><p>本书所收回答来自公开的伯克希尔股东大会与访谈材料；中文内容为站内译稿与整理稿，英文材料仅用于核验与链接。</p><p><a href="${siteUrl}/books/buffett-wenda-lu/">${siteUrl}/books/buffett-wenda-lu/</a></p></section>`));
  writeText(join(epubRoot, 'nav.xhtml'), renderEpubNav(book));
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  writeText(join(epubRoot, 'package.opf'), renderOpf(book, modified));
  writeText(join(epubRoot, 'toc.ncx'), renderNcx(book, `${siteUrl}/books/buffett-wenda-lu/`));

  setTreeMtime(epubWorkRoot);
  mkdirSync(dirname(epubOutputPath), { recursive: true });
  const zipCommand = process.env.QA_BOOK_ZIP ?? 'zip';
  execFileSync(zipCommand, ['-X', '-q', '-0', epubTempPath, 'mimetype'], { cwd: epubWorkRoot });
  execFileSync(zipCommand, ['-X', '-q', '-r', '-9', epubTempPath, 'META-INF', 'EPUB'], { cwd: epubWorkRoot });
  execFileSync(process.env.QA_BOOK_UNZIP ?? 'unzip', ['-tqq', epubTempPath], { stdio: 'ignore' });
  renameSync(epubTempPath, epubOutputPath);
  console.log(`✓ EPUB：${epubOutputPath}`);
}

function buildPdfModel(book) {
  return {
    title: book.manifest.title,
    subtitle: book.manifest.subtitle,
    siteUrl,
    parts: book.parts.map((part) => ({
      id: part.id,
      order: part.order,
      title: part.title,
      chapters: part.chapters.map((chapter) => ({
        id: chapter.id,
        order: chapter.order,
        title: chapter.title,
        subtitle: chapter.subtitle,
        shortTitle: chapter.shortTitle,
        introduction: chapter.introduction,
        closing: chapter.closing,
        movements: chapter.movements.map((movement) => ({
          id: movement.id,
          order: movement.order,
          title: movement.title,
          questions: chapter.questions
            .filter((question) => question.movement.id === movement.id)
            .map((question) => ({
              id: question.id,
              number: qaQuestionNumber(question),
              title: question.title,
              sourceQuestion: question.sourceQuestion.trim(),
              body: question.body,
              source: questionSource(question),
            })),
        })),
      })),
    })),
  };
}

function resolvePython() {
  if (process.env.QA_BOOK_PYTHON) return process.env.QA_BOOK_PYTHON;
  const bundled = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
  return existsSync(bundled) ? bundled : 'python3';
}

function exportPdf(book) {
  mkdirSync(pdfWorkRoot, { recursive: true });
  mkdirSync(dirname(pdfOutputPath), { recursive: true });
  rmSync(pdfTempPath, { force: true });
  writeText(pdfModelPath, `${JSON.stringify(buildPdfModel(book), null, 2)}\n`);
  execFileSync(resolvePython(), [pdfRendererPath, pdfModelPath, pdfTempPath, coverWorkPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  renameSync(pdfTempPath, pdfOutputPath);
  console.log(`✓ PDF：${pdfOutputPath}`);
}

function describeFile(path) {
  return `${relative(repoRoot, path)} (${(statSync(path).size / 1024 / 1024).toFixed(2)} MB)`;
}

async function main() {
  const manifest = loadQaManifest();
  const sources = loadQaSources();
  const book = assembleQaBook(manifest, sources, walkMarkdown(questionsRoot).map(parseQuestion));
  const errors = validateQaBook(book);
  if (errors.length) throw new Error(`问答录校验失败：\n${errors.join('\n')}`);

  rmSync(pdfWorkRoot, { recursive: true, force: true });
  await createPortraitCover(coverWorkPath, book);
  if (requestedFormats.has('html')) exportHtml(book);
  if (requestedFormats.has('epub')) exportEpub(book);
  if (requestedFormats.has('pdf')) exportPdf(book);

  const outputs = [
    requestedFormats.has('html') ? htmlOutputPath : null,
    requestedFormats.has('epub') ? epubOutputPath : null,
    requestedFormats.has('pdf') ? pdfOutputPath : null,
  ].filter(Boolean);
  console.log(`\n✓ 导出完成：${outputs.map(describeFile).join('，')}`);
  rmSync(epubWorkRoot, { recursive: true, force: true });
  rmSync(pdfWorkRoot, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
