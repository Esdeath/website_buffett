import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';

export const prerender = true;
export const GET: APIRoute = () => new Response(
  readFileSync(new URL('../../../../buffett/books/buffett-xuan-gong-si.md', import.meta.url), 'utf8'),
  { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="buffett-xuan-gong-si.md"' } },
);
