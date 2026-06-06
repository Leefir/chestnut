import { describe, it, expect } from 'vitest';
import { truncateToolContent, RUNTIME_TOOL_MAX_CHARS } from '../../../src/core/runtime/truncate.js';

describe('runtime truncateToolContent (phase 140 Step D)', () => {
  it('short content returns as-is with content_size', () => {
    const { preview, cols } = truncateToolContent('hello', []);
    expect(preview).toBe('hello');
    expect(cols).toContain('content_size=5');
  });

  it('long content truncates and adds ellipsis', () => {
    const long = 'a'.repeat(RUNTIME_TOOL_MAX_CHARS + 50);
    const { preview } = truncateToolContent(long, []);
    expect(preview).toBe('a'.repeat(RUNTIME_TOOL_MAX_CHARS) + '…');
  });

  it('empty content yields empty preview and size 0', () => {
    const { preview, cols } = truncateToolContent('', []);
    expect(preview).toBe('');
    expect(cols).toContain('content_size=0');
  });

  it('non-string content throws', () => {
    expect(() => truncateToolContent(123 as unknown as string, [])).toThrow(/expected string/);
  });

  it('maxChars < 1 throws', () => {
    expect(() => truncateToolContent('x', [], { maxChars: 0 })).toThrow(/maxChars must be ≥ 1/);
  });

  it('withHash appends content_hash col', () => {
    const content = 'hello world';
    const { cols } = truncateToolContent(content, [], { withHash: true });
    expect(cols.some(c => c.startsWith('content_hash='))).toBe(true);
    expect(cols).toContain('content_size=11');
  });

  it('content_size measures UTF-8 bytes not chars', () => {
    // '中文' is 6 UTF-8 bytes
    const { cols } = truncateToolContent('中文', []);
    expect(cols).toContain('content_size=6');
  });

  it('ellipsis is Unicode U+2026', () => {
    const long = 'x'.repeat(RUNTIME_TOOL_MAX_CHARS + 1);
    const { preview } = truncateToolContent(long, []);
    expect(preview.endsWith('\u2026')).toBe(true);
  });

  it('extends baseCols atomically', () => {
    const { cols } = truncateToolContent('abc', ['status=ok'], { withHash: true });
    expect(cols[0]).toBe('status=ok');
    expect(cols[1]).toMatch(/^content_size=/);
    expect(cols[2]).toMatch(/^content_hash=/);
  });
});
