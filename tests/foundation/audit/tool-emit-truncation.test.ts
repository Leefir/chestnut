import { describe, it, expect } from 'vitest';
import { truncateToolContent as runtimeTruncate, RUNTIME_TOOL_MAX_CHARS } from '../../../src/core/runtime/truncate.js';
import { truncateToolContent as subagentTruncate } from '../../../src/core/subagent/truncate.js';

describe('tool emit truncation invariant (phase 140 Step E)', () => {
  it('runtime tool_result preview length ≤ max_chars + 1 ellipsis', () => {
    const longContent = 'x'.repeat(1000);
    const { preview } = runtimeTruncate(longContent, []);
    expect(preview.length).toBe(RUNTIME_TOOL_MAX_CHARS + 1); // + '…'
    expect(preview.endsWith('…')).toBe(true);
  });

  it('runtime tool_result cols contain all 4 ID cols + content_size + status', () => {
    const toolUseId = 'call_01_abc123';
    const step = 3;
    const contractId = 'contract-123';
    const traceId = 'deadbeefcafebabe';
    const { preview, cols } = runtimeTruncate('result content', [
      `tool_use_id=${toolUseId}`,
      `step=${step}`,
      `contract_id=${contractId}`,
      `trace_id=${traceId}`,
      `status=ok`,
    ]);
    expect(preview).toBe('result content');
    expect(cols.some(c => c.startsWith('tool_use_id='))).toBe(true);
    expect(cols.some(c => c.startsWith('step='))).toBe(true);
    expect(cols.some(c => c.startsWith('contract_id='))).toBe(true);
    expect(cols.some(c => c.startsWith('trace_id='))).toBe(true);
    expect(cols.some(c => c.startsWith('status='))).toBe(true);
    expect(cols.some(c => c.startsWith('content_size='))).toBe(true);
  });

  it('content_size matches UTF-8 byte length of original content', () => {
    const content = 'abc 中文 def';
    const { cols } = runtimeTruncate(content, []);
    const sizeCol = cols.find(c => c.startsWith('content_size='));
    expect(sizeCol).toBe(`content_size=${Buffer.byteLength(content, 'utf-8')}`);
  });

  it('subagent tool_result uses truncate helper and adds required cols', () => {
    const { preview, cols } = subagentTruncate('subagent tool result', [
      `tool_use_id=call_02_xyz789`,
      `step=1`,
      `contract_id=`,
      `trace_id=`,
      `status=ok`,
    ]);
    expect(preview).toBe('subagent tool result');
    expect(cols.some(c => c.startsWith('content_size='))).toBe(true);
  });

  it('row does not contain raw un-truncated content in audit cols', () => {
    const long = 'a'.repeat(5000);
    const { preview, cols } = runtimeTruncate(long, []);
    expect(preview.length).toBeLessThan(5000);
    for (const col of cols) {
      expect(col.length).toBeLessThan(500);
    }
  });

  it('empty contract_id / trace_id still emits the col (required presence)', () => {
    const { cols } = runtimeTruncate('x', [
      'tool_use_id=call_03_empty',
      'step=0',
      'contract_id=',
      'trace_id=',
      'status=ok',
    ]);
    expect(cols.some(c => c === 'contract_id=')).toBe(true);
    expect(cols.some(c => c === 'trace_id=')).toBe(true);
  });
});
