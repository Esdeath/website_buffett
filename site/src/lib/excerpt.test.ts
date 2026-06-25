import { describe, it, expect } from 'vitest';
import { toExcerpt } from './excerpt';

describe('toExcerpt', () => {
  it('strips bare wikilinks, keeping the target text', () => {
    expect(toExcerpt('[[子女教育]]在巴菲特那里有两层含义。')).toBe(
      '子女教育在巴菲特那里有两层含义。',
    );
  });

  it('strips piped wikilinks, keeping the label', () => {
    expect(toExcerpt('参见 [[zi-nv-jiao-yu|子女教育]] 一文。')).toBe(
      '参见 子女教育 一文。',
    );
  });

  it('strips markdown links, keeping the label', () => {
    expect(toExcerpt('见 [蓝筹印花](/sources/x) 公司。')).toBe('见 蓝筹印花 公司。');
  });

  it('drops images entirely', () => {
    expect(toExcerpt('![封面](/og/x.png)正文开始。')).toBe('正文开始。');
  });

  it('drops heading lines and uses the following prose', () => {
    const md = '## 一句话定义\n\n子女教育有两层含义。\n\n## 中心问题\n\n如何教。';
    expect(toExcerpt(md)).toBe('子女教育有两层含义。 如何教。');
  });

  it('strips emphasis, inline code and blockquote/list markers', () => {
    const md = '> **重要**：`复利` 是核心。\n\n- 第一条规则\n- 第二条规则';
    expect(toExcerpt(md)).toBe('重要：复利 是核心。 第一条规则 第二条规则');
  });

  it('removes html tags', () => {
    expect(toExcerpt('文本<br/>含 <span class="x">标签</span>。')).toBe('文本含 标签。');
  });

  it('drops a leading frontmatter block if present', () => {
    const md = '---\ntitle: x\n---\n\n正文内容。';
    expect(toExcerpt(md)).toBe('正文内容。');
  });

  it('collapses whitespace and newlines into single spaces', () => {
    expect(toExcerpt('第一段。\n\n\n第二段。   第三段。')).toBe('第一段。 第二段。 第三段。');
  });

  it('returns short text unchanged with no ellipsis', () => {
    expect(toExcerpt('短句。')).toBe('短句。');
  });

  it('truncates to maxLen and appends an ellipsis', () => {
    const out = toExcerpt('一二三四五六七八九十', 5);
    expect(out).toBe('一二三四五…');
  });

  it('does not append an ellipsis when text fits exactly', () => {
    expect(toExcerpt('一二三四五', 5)).toBe('一二三四五');
  });

  it('trims trailing whitespace before the ellipsis', () => {
    expect(toExcerpt('一二三 四五六', 4)).toBe('一二三…');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(toExcerpt('')).toBe('');
    expect(toExcerpt('   \n\n  ')).toBe('');
  });
});
