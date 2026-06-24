import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRegistry, buildLookup } from '../src/lib/registry.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VALID_TYPES = new Set(['category-overview', 'keyword', 'company', 'industry', 'person', 'question', 'timeline']);
const DIRS = ['category-overviews', 'keywords', 'companies', 'industries', 'people', 'questions', 'timelines'];
// 原文素材目录 + 合法 category(与 src/lib/sources.ts 的 SOURCE_GROUP_SLUG 对齐)。
const SOURCE_DIRS = ['berkshire', 'interview', 'shareholders'];
const VALID_SOURCE_CATEGORIES = new Set(['访谈与文章', '致股东信', '致合伙人信', '股东大会']);

const errors = [];
const warnings = [];

const entries = parseRegistry(readFileSync(root + 'docs/keyword-registry.md', 'utf8'));
const lookup = buildLookup(entries);
const regSlugs = new Set(entries.map((e) => e.slug));

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (mm) fm[mm[1]] = mm[2];
  }
  return fm;
}

/** 递归收集目录下全部 .md 绝对路径(原文目录有嵌套子目录)。 */
function walkMd(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walkMd(p));
    else if (ent.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const seenSlugs = new Set();
for (const dir of DIRS) {
  const base = root + 'buffett/articles/' + dir;
  for (const file of readdirSync(base).filter((f) => f.endsWith('.md'))) {
    const path = `${base}/${file}`;
    const slug = file.replace(/\.md$/, '');
    const text = readFileSync(path, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) { errors.push(`${path}: 缺少 frontmatter`); continue; }
    if (!fm.title) errors.push(`${path}: 缺少 title`);
    if (!VALID_TYPES.has(fm.type)) errors.push(`${path}: 非法 type "${fm.type}"`);
    if (fm.slug !== slug) errors.push(`${path}: slug "${fm.slug}" 与文件名 "${slug}" 不一致`);
    if (seenSlugs.has(`${fm.type}/${slug}`)) errors.push(`${path}: 重复 slug ${slug}`);
    seenSlugs.add(`${fm.type}/${slug}`);

    // wiki-link 全部可解析
    for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const kw = m[1].split('|')[0].trim();
      if (!lookup.get(kw)) errors.push(`${path}: 死链 [[${kw}]]`);
    }
    // keyword 文章的 slug 必须在 registry 注册(category 真相来源;否则装配层会兜底误分类)
    if (fm.type === 'keyword' && !regSlugs.has(slug)) {
      errors.push(`${path}: keyword 文章 slug 未在 registry 注册`);
    }
    // 来源矩阵 + 原话卡片存在
    if (!existsSync(`${root}docs/source-matrices/${slug}.md`)) warnings.push(`${path}: 缺来源矩阵`);
    if (!existsSync(`${root}docs/quote-cards/${slug}.md`)) warnings.push(`${path}: 缺原话卡片`);
  }
}

// 原文素材:不要求 type/registry/来源矩阵;校验 title、slug 一致性、category 合法、order 数字、slug 唯一。
const seenSourceSlugs = new Set();
for (const dir of SOURCE_DIRS) {
  for (const path of walkMd(root + 'buffett/' + dir)) {
    const slug = path.replace(/^.*\//, '').replace(/\.md$/, '');
    const text = readFileSync(path, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) { errors.push(`${path}: 缺少 frontmatter`); continue; }
    if (!fm.title) errors.push(`${path}: 缺少 title`);
    if (fm.slug !== slug) errors.push(`${path}: slug "${fm.slug}" 与文件名 "${slug}" 不一致`);
    if (!VALID_SOURCE_CATEGORIES.has(fm.category)) errors.push(`${path}: 非法原文 category "${fm.category}"`);
    if (!/^\d+$/.test(fm.order ?? '')) errors.push(`${path}: order 必须是数字,得到 "${fm.order}"`);
    if (seenSourceSlugs.has(slug)) errors.push(`${path}: 重复原文 slug ${slug}`);
    seenSourceSlugs.add(slug);

    // wiki-link 全部可解析(原文正文里的 [[...]] 若有也要可解析)
    for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const kw = m[1].split('|')[0].trim();
      if (!lookup.get(kw)) errors.push(`${path}: 死链 [[${kw}]]`);
    }
  }
}

for (const w of warnings) console.warn('⚠ ', w);
if (errors.length) {
  for (const e of errors) console.error('✗ ', e);
  console.error(`\n校验失败: ${errors.length} 个错误。`);
  process.exit(1);
}
console.log(`✓ 校验通过 (${seenSlugs.size} 篇文章 + ${seenSourceSlugs.size} 篇原文, ${warnings.length} 个警告)。`);
