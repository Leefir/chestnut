import { describe, it, expect } from 'vitest';
import { truncateToolContent, ASYNC_TASK_MAX_CHARS } from '../../../src/core/async-task-system/truncate.js';

describe('async-task-system truncateToolContent (phase 140 Step D)', () => {
  it('respects owner max_chars', () => {
    const long = 'e'.repeat(ASYNC_TASK_MAX_CHARS + 20);
    const { preview } = truncateToolContent(long, []);
    expect(preview).toBe('e'.repeat(ASYNC_TASK_MAX_CHARS) + '…');
  });

  it('short content unchanged', () => {
    const { preview, cols } = truncateToolContent('task result', []);
    expect(preview).toBe('task result');
    expect(cols).toContain('content_size=11');
  });

  it('throws on negative maxChars', () => {
    expect(() => truncateToolContent('x', [], { maxChars: -1 })).toThrow(/maxChars must be ≥ 1/);
  });
});
