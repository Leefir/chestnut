/**
 * Turn completeness cross-source audit (phase 227)
 */

import { describe, it, expect } from 'vitest';
import type { Message } from '../../../src/foundation/llm-provider/types.js';
import { makeAudit } from '../../helpers/audit.js';
import { auditTurnCompleteness } from '../../../src/core/runtime/turn-completeness.js';
import { RUNTIME_AUDIT_EVENTS } from '../../../src/core/runtime/runtime-audit-events.js';
import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('turn completeness cross-source audit (phase 227)', () => {
  it('完全 align：3 对照 0 emit', () => {
    const { audit, events } = makeAudit();
    const streamCounts = { textEnd: 1, toolCall: 2, toolResult: 2 };
    const turnSlice: Message[] = [
      { role: 'assistant', content: [
        { type: 'text', text: 'plan' },
        { type: 'tool_use', id: 't1', name: 'exec', input: {} },
        { type: 'tool_use', id: 't2', name: 'exec', input: {} },
      ]},
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
        { type: 'tool_result', tool_use_id: 't2', content: 'ok' },
      ]},
    ];
    auditTurnCompleteness(streamCounts, turnSlice, audit, 'trace1');
    expect(events.filter(e => e[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH)).toHaveLength(0);
  });

  it('text_end mismatch：stream=N、dialog text block=0 → emit kind=text_block_count', () => {
    const { audit, events } = makeAudit();
    const streamCounts = { textEnd: 5, toolCall: 0, toolResult: 0 };
    auditTurnCompleteness(streamCounts, [], audit, 'trace1');
    expect(events.some(w =>
      w[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH
      && w.some(a => String(a).includes('text_block_count'))
      && w.some(a => String(a).includes('stream_text_end=5'))
      && w.some(a => String(a).includes('dialog_text_block=0'))
    )).toBe(true);
  });

  it('tool_use mismatch：stream tool_call=104、dialog tool_use=0 (phase 224 fixture style)', () => {
    const { audit, events } = makeAudit();
    const streamCounts = { textEnd: 1093, toolCall: 104, toolResult: 15 };
    auditTurnCompleteness(streamCounts, [], audit, 'phase224-trace');
    const mismatchEvents = events.filter(w => w[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH);
    expect(mismatchEvents).toHaveLength(3);
  });

  it('tool_result mismatch：stream=1、dialog=0 → emit kind=tool_result_count', () => {
    const { audit, events } = makeAudit();
    const streamCounts = { textEnd: 0, toolCall: 0, toolResult: 1 };
    auditTurnCompleteness(streamCounts, [], audit, 'trace1');
    expect(events.some(w =>
      w[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH
      && w.some(a => String(a).includes('tool_result_count'))
    )).toBe(true);
  });

  it('string content assistant 算 1 text block', () => {
    const { audit, events } = makeAudit();
    const streamCounts = { textEnd: 1, toolCall: 0, toolResult: 0 };
    const turnSlice: Message[] = [
      { role: 'assistant', content: 'hello' },
    ];
    auditTurnCompleteness(streamCounts, turnSlice, audit, 'trace1');
    expect(events.filter(e => e[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH)).toHaveLength(0);
  });

  it('user string content 不算 text block', () => {
    const { audit, events } = makeAudit();
    const streamCounts = { textEnd: 0, toolCall: 0, toolResult: 0 };
    const turnSlice: Message[] = [
      { role: 'user', content: 'hello' },
    ];
    auditTurnCompleteness(streamCounts, turnSlice, audit, 'trace1');
    expect(events.filter(e => e[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH)).toHaveLength(0);
  });

  it('phase 224 fixture 重放：stream 大量 events / dialog turn slice empty → 至少 trip 1 类', () => {
    const { audit, events } = makeAudit();
    const fixturePath = path.join(__dirname, 'fixtures', 'phase224-turn-counts.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    auditTurnCompleteness(fixture.streamCounts, fixture.turnSlice, audit, fixture.traceId);
    const mismatchEvents = events.filter(w => w[0] === RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH);
    expect(mismatchEvents.length).toBeGreaterThanOrEqual(1);
  });
});
