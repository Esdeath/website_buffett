import type { APIRoute } from 'astro';
import { buildLlmsVolumes } from '../../lib/llms-full';

export async function getStaticPaths() {
  const volumes = await buildLlmsVolumes(new URL('https://buffett.ayaseeri.com'));
  return volumes.map((volume) => ({
    params: { volume: volume.id },
    props: { body: volume.body },
  }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as string, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
