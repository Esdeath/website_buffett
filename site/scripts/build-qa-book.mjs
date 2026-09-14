import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { parseRegistry } from '../src/lib/registry.ts';
import {
  assembleQaBook,
  isQaBookMarkdownCurrent,
  loadQaManifest,
  loadQaSources,
  renderQaBookMarkdownFromBook,
} from '../src/lib/qa-book.ts';
import {
  extractAnchoredSourceText,
  hashQaSourceText,
  validateQaBook,
  validateQaKeywordRegistry,
  validateQaSourceDocuments,
} from '../src/lib/qa-book-validation.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const bookRoot = join(repoRoot, 'buffett/books/buffett-wenda-lu');
const questionsRoot = join(bookRoot, 'questions');
const outputPath = join(repoRoot, 'buffett/books/buffett-wenda-lu.md');
const registryPath = join(repoRoot, 'docs/keyword-registry.md');
const check = process.argv.includes('--check');
const writeHashes = process.argv.includes('--write-hashes');
const validateOnly = process.argv.includes('--validate-only');
const siteUrlArg = process.argv.find((arg) => arg.startsWith('--site-url='));
const siteUrl = siteUrlArg?.slice('--site-url='.length);

function walkMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
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
  return { filePath: path, text, data, body: text.slice(match[0].length) };
}

function sourceFilePath(source) {
  if (source.sourcePath) {
    if (isAbsolute(source.sourcePath)) return source.sourcePath;
    const relative = source.sourcePath.replace(/^(\.\.\/)+/, '');
    return join(repoRoot, relative.startsWith('buffett/') ? relative : `buffett/${relative}`);
  }
  const directory = source.type === 'annual-meeting' ? 'shareholders' : 'interview';
  return join(repoRoot, 'buffett', directory, `${source.localSlug}.md`);
}

function loadSourceDocuments(sources) {
  const documents = new Map();
  for (const source of sources) {
    const path = sourceFilePath(source);
    if (existsSync(path)) documents.set(source.id, { path, text: readFileSync(path, 'utf8') });
  }
  return documents;
}

function updateQuestionHash(input, source, document) {
  if (!document) throw new Error(`${input.data.id}: 无法读取来源文件 ${sourceFilePath(source)}`);
  const excerpt = extractAnchoredSourceText(
    document.text,
    input.data.sourceStartAnchor,
    input.data.sourceEndAnchor,
  );
  if (excerpt === null) throw new Error(`${input.data.id}: 来源中找不到完整起止锚点`);
  const sourceHash = hashQaSourceText(excerpt);
  const next = input.text.replace(
    /^(sourceHash:\s*)(?:"[^"]*"|'[^']*'|\S+)\s*$/m,
    `$1${sourceHash}`,
  );
  if (next === input.text && input.data.sourceHash !== sourceHash) {
    throw new Error(`${input.filePath}: 无法更新 sourceHash 字段`);
  }
  if (next !== input.text) writeFileSync(input.filePath, next);
  input.text = next;
  input.data.sourceHash = sourceHash;
}

function fail(errors) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n问答录校验失败：${errors.length} 个错误。`);
  process.exit(1);
}

try {
  const manifest = loadQaManifest();
  const sources = loadQaSources();
  const parsed = walkMarkdown(questionsRoot).map(parseQuestion);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const documents = loadSourceDocuments(sources);

  if (writeHashes) {
    for (const input of parsed) {
      const source = sourceById.get(input.data.sourceId);
      if (!source) throw new Error(`${input.data.id}: 来源清单中不存在 ${input.data.sourceId}`);
      updateQuestionHash(input, source, documents.get(source.id));
    }
  }

  const book = assembleQaBook(manifest, sources, parsed);
  const registrySlugs = new Set(parseRegistry(readFileSync(registryPath, 'utf8')).map((entry) => entry.slug));
  const errors = [
    ...validateQaBook(book),
    ...validateQaKeywordRegistry(book, registrySlugs),
    ...validateQaSourceDocuments(book, documents),
  ];
  if (errors.length) fail(errors);

  const markdown = renderQaBookMarkdownFromBook(book, siteUrl);
  if (validateOnly) {
    console.log(`✓ 巴菲特问答录校验通过（${book.questions.length} 问）。`);
  } else if (check) {
    if (!existsSync(outputPath)) fail([`${outputPath}: 生成稿不存在，请运行 npm run build:qa-book`]);
    if (!isQaBookMarkdownCurrent(readFileSync(outputPath, 'utf8'), book, siteUrl)) {
      fail([`${outputPath}: 生成稿已过期，请运行 npm run build:qa-book`]);
    }
    console.log('✓ 巴菲特问答录内容与生成稿一致。');
  } else {
    writeFileSync(outputPath, markdown);
    console.log(`✓ 已生成 ${outputPath}（${book.questions.length} 问）。`);
  }
} catch (error) {
  fail([error instanceof Error ? error.message : String(error)]);
}
