import type { APIRoute } from 'astro';
import { buildLlmsVolumes, renderLlmsIndex } from '../lib/llms-full';

// /llms-full.txt —— 不再是 17MB 单文件，而是分卷索引。
// 每卷在 /llms-full/<id>.txt，单卷 ≤ 约 1.5MB，避免抓取端截断。
export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://buffett.ayaseeri.com');
  const volumes = await buildLlmsVolumes(base);
  return new Response(renderLlmsIndex(base, volumes), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
