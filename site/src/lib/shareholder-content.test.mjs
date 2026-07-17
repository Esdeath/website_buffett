import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const shareholderDir = fileURLToPath(new URL('../../../buffett/shareholders/', import.meta.url));

describe('shareholder meeting content', () => {
  test('leaves whitespace after bold speaker labels so Markdown renders them', () => {
    const malformed = [];

    for (const file of readdirSync(shareholderDir).filter((name) => name.endsWith('.md'))) {
      const lines = readFileSync(`${shareholderDir}/${file}`, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const missingWhitespace = /\*\*[^*\n]+：\*\*\S/.test(line);
        const escapedSpeakerLabel = /\\\*\\\*[^\n]+：\\\*\\\*/.test(line);
        if (missingWhitespace || escapedSpeakerLabel) malformed.push(`${file}:${index + 1}`);
      });
    }

    expect(malformed).toEqual([]);
  });
});
