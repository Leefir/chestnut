import { describe, it, expect } from 'vitest';
import { truncateToolContent, SUBAGENT_TOOL_MAX_CHARS } from '../../../src/core/subagent/truncate.js';

describe('subagent truncateToolContent (phase 140 Step D)', () => {
  it('respects owner max_chars', () => {
    const long = 'b'.repeat(SUBAGENT_TOOL_MAX_CHARS + 5);
    const { preview } = truncateToolContent(long, []);
    expect(preview).toBe('b'.repeat(SUBAGENT_TOOL_MAX_CHARS) + '…');
  });

  it('returns content_size', () => {
    const { preview, cols } = truncateToolContent('sub', ['status=ok']);
    expect(preview).toBe('sub');
    expect(cols).toContain('content_size=3');
    expect(cols[0]).toBe('status=ok');
  });

  it('custom maxChars override works', () => {
    const { preview } = truncateToolContent('abcdef', [], { maxChars: 3 });
    expect(preview).toBe('abc…');
  });
});
