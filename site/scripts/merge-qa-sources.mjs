import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const bookRoot = join(repoRoot, 'buffett/books/buffett-wenda-lu');
const inputPaths = [
  join(bookRoot, 'sources-meetings.json'),
  join(bookRoot, 'sources-interviews.json'),
];
const outputPath = join(bookRoot, 'sources.json');

const missing = inputPaths.filter((path) => !existsSync(path));
if (missing.length) throw new Error(`缺少来源清单：${missing.join('、')}`);

const entries = inputPaths.flatMap((path) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.sources)) return value.sources;
  throw new Error(`${path}: 来源清单必须是数组或 { "sources": [...] }`);
});

if (!entries.length) throw new Error('没有可合并的问答录来源清单。');
const ids = new Set();
for (const entry of entries) {
  if (!entry.id) throw new Error('来源条目缺少 id。');
  if (ids.has(entry.id)) throw new Error(`来源 ID 重复：${entry.id}`);
  ids.add(entry.id);
}
entries.sort((a, b) => Number(a.year ?? String(a.date).slice(0, 4)) - Number(b.year ?? String(b.date).slice(0, 4)) || a.id.localeCompare(b.id));
writeFileSync(outputPath, `${JSON.stringify({ version: 1, sources: entries }, null, 2)}\n`);
console.log(`✓ 已合并 ${entries.length} 条来源到 ${outputPath}`);
