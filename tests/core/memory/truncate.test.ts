import { describe, it, expect } from 'vitest';
import { truncateToolContent, MEMORY_DREAM_MAX_CHARS } from '../../../src/core/memory/truncate.js';

describe('memory truncateToolContent (phase 140 Step D)', () => {
  it('uses owner-specific larger max_chars (500)', () => {
    const long = 'd'.repeat(MEMORY_DREAM_MAX_CHARS + 10);
    const { preview } = truncateToolContent(long, []);
    expect(preview).toBe('d'.repeat(MEMORY_DREAM_MAX_CHARS) + '…');
  });

  it('returns content_size for dream content', () => {
    const content = 'dream output line 1\ndream output line 2';
    const { cols } = truncateToolContent(content, []);
    expect(cols).toContain(`content_size=${Buffer.byteLength(content, 'utf-8')}`);
  });

  it('withHash optional', () => {
    const without = truncateToolContent('x', []);
    const withHash = truncateToolContent('x', [], { withHash: true });
    expect(without.cols.some(c => c.startsWith('content_hash='))).toBe(false);
    expect(withHash.cols.some(c => c.startsWith('content_hash='))).toBe(true);
  });
});
