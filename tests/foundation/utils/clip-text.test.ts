import { describe, it, expect } from 'vitest';
import { clipText } from '../../../src/foundation/utils/format.js';

describe('clipText', () => {
  it('returns short strings unchanged', () => {
    expect(clipText('hello', 10)).toBe('hello');
  });

  it('truncates to maxChars and appends ellipsis', () => {
    const s = 'a'.repeat(20);
    expect(clipText(s, 10)).toBe('a'.repeat(10) + '…');
  });

  it('trims leading whitespace', () => {
    expect(clipText('   hello', 10)).toBe('hello');
  });

  it('preserves newlines', () => {
    expect(clipText('a\nb', 10)).toBe('a\nb');
  });

  it('handles nullish input', () => {
    expect(clipText(undefined as unknown as string, 5)).toBe('');
    expect(clipText(null as unknown as string, 5)).toBe('');
  });
});
