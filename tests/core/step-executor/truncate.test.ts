import { describe, it, expect } from 'vitest';
import { truncateToolContent, STEP_EXECUTOR_TOOL_MAX_CHARS } from '../../../src/core/step-executor/truncate.js';

describe('step-executor truncateToolContent (phase 140 Step D)', () => {
  it('respects owner max_chars', () => {
    const long = 'a'.repeat(STEP_EXECUTOR_TOOL_MAX_CHARS + 10);
    const { preview } = truncateToolContent(long, []);
    expect(preview).toBe('a'.repeat(STEP_EXECUTOR_TOOL_MAX_CHARS) + '…');
  });

  it('returns content_size in bytes', () => {
    const { cols } = truncateToolContent('hello', []);
    expect(cols).toContain('content_size=5');
  });

  it('withHash appends sha256 prefix', () => {
    const { cols } = truncateToolContent('data', [], { withHash: true });
    const hashCol = cols.find(c => c.startsWith('content_hash='));
    expect(hashCol).toBeDefined();
    expect(hashCol!.length).toBe('content_hash='.length + 8);
  });

  it('throws on non-string', () => {
    expect(() => truncateToolContent(null as unknown as string, [])).toThrow(/expected string/);
  });
});
