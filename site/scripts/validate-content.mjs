import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRegistry, buildLookup } from '../src/lib/registry.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VALID_TYPES = new Set(['category-overview', 'keyword', 'company', 'industry', 'person', 'question', 'timeline']);
const DIRS = ['category-overviews', 'keywords', 'companies', 'industries', 'people', 'questions', 'timelines'];

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

for (const w of warnings) console.warn('⚠ ', w);
if (errors.length) {
  for (const e of errors) console.error('✗ ', e);
  console.error(`\n校验失败: ${errors.length} 个错误。`);
  process.exit(1);
}
console.log(`✓ 校验通过 (${seenSlugs.size} 篇文章, ${warnings.length} 个警告)。`);
