import type { APIRoute } from 'astro';
import { renderQaBookMarkdown } from '../../lib/qa-book';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const markdown = await renderQaBookMarkdown((site ?? new URL('https://buffett.ayaseeri.com')).href);
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="buffett-wenda-lu.md"',
    },
  });
};
