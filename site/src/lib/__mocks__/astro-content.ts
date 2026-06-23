// Mock for astro:content virtual module — used only in vitest
export async function getCollection(_name: string) {
  return [];
}
