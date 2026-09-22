/** 原文分类顺序与 URL 的共同来源，亦供离线书稿构建使用。 */
export const SOURCE_GROUP_SLUG: Record<string, string> = {
  '访谈与文章': 'interviews',
  '致股东信': 'letters',
  '致合伙人信': 'partner-letters',
  '股东大会': 'meetings',
};

export function sourceUrl(category: string, slug: string): string {
  const group = SOURCE_GROUP_SLUG[category];
  if (!group) throw new Error(`未知原文分类: ${category}`);
  return `/sources/${group}/${slug}`;
}
