// 生成 OG 图所需的 CJK 字幕字体子集(Noto Serif SC, OFL,可再分发)。
//
// 做法:收集全站标题 + 品牌/分类等固定文案里出现的全部字符,用 Google Fonts 的
// 动态子集接口(?text=)取回「只含这些字形」的字体。该接口对 URL 长度有约 ~7KB 的
// 上限(超出会返回空字体),故按 URL 长度分批取回,再用 fontTools 合并成单一 TTF
// ——单字体覆盖全部字形,OG 渲染时 canvaskit 无需跨字体回退(同名字体不会自动回退)。
//
// 产物:src/assets/og-noto-serif-sc-subset.ttf(提交入库)。构建期不依赖网络。
// 依赖:python3 + fontTools(仅此维护脚本需要,正式构建不需要)。
// 何时重跑:新增标题引入了从未用过的汉字(OG 图里该字会变成豆腐块)时,执行
//   npm run build:og-font
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { convert } from 'fontverter';

const buffettDir = fileURLToPath(new URL('../../buffett', import.meta.url));
const outPath = fileURLToPath(new URL('../src/assets/og-noto-serif-sc-subset.ttf', import.meta.url));
const mergeScript = fileURLToPath(new URL('./merge-fonts.py', import.meta.url));

function mdFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

const chars = new Set();
const add = (s) => {
  for (const ch of s || '') if (ch.trim()) chars.add(ch);
};

for (const f of mdFiles(buffettDir)) {
  const txt = readFileSync(f, 'utf8');
  const t = txt.match(/^title:\s*"?(.+?)"?\s*$/m);
  if (t) add(t[1]);
  const st = txt.match(/^seoTitle:\s*"?(.+?)"?\s*$/m);
  if (st) add(st[1]);
}

// 站点固定文案:品牌、标语、分类/分组名、作者名,以及 ASCII/标点。
add('巴菲特知识库巴菲特总纲慢慢读，反复看，用原文校准判断。');
add('原文解读致股东信致合伙人信访谈与文章股东大会滚雪球的Star');
add('核心哲学投资理念企业经营财务指标品格与心性公司行业人物');
add('保险、浮存金与风险市场周期与风险控制宏观经济与投资环境分类总论问题时间线');
add('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
add('：·，。、（）()「」《》—…？！%&｜|/-’“”\'"');

const all = [...chars];
const PREFIX = 'https://fonts.googleapis.com/css?family=Noto+Serif+SC:700&text=';
const MAX_URL = 5800; // 实测 ~7KB 处会返回空字体,留足余量

// 贪心按 URL 长度分批
const batches = [];
let cur = [];
for (const ch of all) {
  const next = [...cur, ch];
  if ((PREFIX + encodeURIComponent(next.join(''))).length > MAX_URL && cur.length) {
    batches.push(cur);
    cur = [ch];
  } else {
    cur = next;
  }
}
if (cur.length) batches.push(cur);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchSubsetTtf(textChunk) {
  const url = PREFIX + encodeURIComponent(textChunk);
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const m = css.match(/url\((https:[^)]+)\)/);
  if (!m) throw new Error('未能解析字体 URL:\n' + css.slice(0, 300));
  const woff2 = Buffer.from(
    await (await fetch(m[1], { headers: { 'User-Agent': UA } })).arrayBuffer(),
  );
  // canvaskit 只吃 SFNT;Google 返回的 woff2 已是精确子集,仅做格式转换(不二次子集化)。
  const ttf = Buffer.from(await convert(woff2, 'truetype'));
  if (ttf.length < 5000) throw new Error(`子集异常偏小(${ttf.length}B),疑似被 Google 截断`);
  return ttf;
}

const tmp = join(tmpdir(), `og-font-${batches.length}-${all.length}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const batchFiles = [];
for (let i = 0; i < batches.length; i++) {
  const ttf = await fetchSubsetTtf(batches[i].join(''));
  const p = join(tmp, `${i}.ttf`);
  writeFileSync(p, ttf);
  batchFiles.push(p);
  console.log(`[og-font] 批 ${i}: ${batches[i].length} 字形, ${(ttf.length / 1024).toFixed(0)} KB`);
}

// 合并为单一 TTF(覆盖全部字形)
mkdirSync(dirname(outPath), { recursive: true });
execFileSync('python3', [mergeScript, outPath, ...batchFiles], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });

const finalKb = (statSync(outPath).size / 1024).toFixed(0);
console.log(`[og-font] 完成:${chars.size} 字形 → ${outPath}(${finalKb} KB)`);
