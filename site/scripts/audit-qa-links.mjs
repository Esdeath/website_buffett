import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { loadQaSources } from '../src/lib/qa-book.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const bookRoot = join(repoRoot, 'buffett/books/buffett-wenda-lu');
const questionsRoot = join(bookRoot, 'questions');
const urls = new Set(loadQaSources().map((source) => source.englishUrl).filter(Boolean));
const ACCESS_RESTRICTED_HOSTS = new Set([
  'finance.yahoo.com',
  'www.pbs.org',
  'www.youtube.com',
  'youtube.com',
]);

if (existsSync(questionsRoot)) {
  for (const file of readdirSync(questionsRoot).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(questionsRoot, file), 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    const data = parseYaml(match[1]);
    if (data?.externalLocator && typeof data.externalLocator === 'object' && data.externalLocator.url) {
      urls.add(data.externalLocator.url);
    }
  }
}

async function request(url, method) {
  return fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'user-agent': 'BuffettKnowledgeBase-LinkAudit/1.0',
      ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
    },
  });
}

async function audit(url) {
  try {
    let response = await request(url, 'HEAD');
    if (response.status >= 400 && ![401, 403, 429].includes(response.status)) {
      response = await request(url, 'GET');
    }
    if (response.ok || [401, 403, 429].includes(response.status)) {
      return { url, status: response.status, warning: !response.ok };
    }
    return { url, status: response.status, error: `HTTP ${response.status}` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const hostname = new URL(url).hostname;
    if (ACCESS_RESTRICTED_HOSTS.has(hostname)) {
      return { url, warning: true, restricted: true, detail };
    }
    return { url, error: detail };
  }
}

const pending = [...urls].sort();
const results = [];
const concurrency = 6;
for (let index = 0; index < pending.length; index += concurrency) {
  results.push(...await Promise.all(pending.slice(index, index + concurrency).map(audit)));
}

const failures = results.filter((result) => result.error);
const warnings = results.filter((result) => result.warning);
for (const result of failures) console.error(`✗ ${result.url}: ${result.error}`);
for (const result of warnings) {
  const detail = result.restricted ? `网络访问受限（${result.detail}）` : `HTTP ${result.status}`;
  console.warn(`⚠ ${result.url}: ${detail}，需人工复核`);
}
if (failures.length) {
  console.error(`\n外链审计失败：${failures.length}/${results.length} 个链接不可访问。`);
  process.exit(1);
}
console.log(`✓ 外链审计通过（${results.length} 个链接，${warnings.length} 个受限响应）。`);
