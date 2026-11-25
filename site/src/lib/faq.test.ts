import { describe, expect, it } from 'vitest';
import { buildFaqLd, extractFaq } from './faq';

const numbered = `## 常见问题

1. 巴菲特怎么判断一家公司有没有定价权？看它能不能在不祈祷的情况下提价，而且涨完客户不跑。
2. 定价权和品牌是什么关系？品牌是定价权最常见的来源，但定价权也可能来自地理位置或双寡头格局。

## 总结

结尾。`;

const headed = `## 常见问题

### 喜诗糖果的护城河是什么？

核心是消费者心智，顾客不愿用便宜替代品冒险。

### 喜诗为什么有定价权？

因为它卖的是礼物和情感表达，价格敏感度较低。`;

describe('extractFaq', () => {
  it('parses numbered Q&A', () => {
    const items = extractFaq(numbered);
    expect(items).toHaveLength(2);
    expect(items[0].question).toContain('定价权');
    expect(items[0].answer).toContain('不祈祷');
  });

  it('parses heading Q&A', () => {
    const items = extractFaq(headed);
    expect(items).toHaveLength(2);
    expect(items[0].question).toBe('喜诗糖果的护城河是什么？');
    expect(items[0].answer).toContain('消费者心智');
  });

  it('strips wikilinks and needs at least three items for schema', () => {
    expect(extractFaq('## 常见问题\n\n1. 什么是[[护城河]]？它是长期的竞争优势。')[0].question).toBe('什么是护城河？');
    expect(buildFaqLd(extractFaq(numbered), 'https://buffett.ayaseeri.com/keywords/x/')).toBeNull();
  });
});
