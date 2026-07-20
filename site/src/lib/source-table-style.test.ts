import { describe, expect, it } from 'vitest';
import { usesLetterTableStyle } from './sources';

describe('usesLetterTableStyle', () => {
  it.each(['致股东信', '致合伙人信'])('enables annual-report tables for %s', (category) => {
    expect(usesLetterTableStyle(category)).toBe(true);
  });

  it.each(['访谈与文章', '股东大会', '核心哲学', ''])('leaves %s unchanged', (category) => {
    expect(usesLetterTableStyle(category)).toBe(false);
  });
});
