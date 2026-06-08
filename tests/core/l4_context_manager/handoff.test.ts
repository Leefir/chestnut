import { describe, it, expect } from 'vitest';
import { createHandoffMarker, resolveHandoffMarker } from '../../../src/core/l4_context_manager/handoff.js';

describe('createHandoffMarker', () => {
  it('返 marker 含 id (UUID) + parentRound + createdAt', () => {
    const m = createHandoffMarker('round-123');
    expect(m.parentRound).toBe('round-123');
    expect(typeof m.id).toBe('string');
    expect(m.id.length).toBeGreaterThan(20);   // UUID 长度
    expect(typeof m.createdAt).toBe('number');
  });

  it('两次调用 id 不同（防 collision）', () => {
    const a = createHandoffMarker('r1');
    const b = createHandoffMarker('r1');
    expect(a.id).not.toBe(b.id);
  });
});

describe('resolveHandoffMarker', () => {
  it('TBD 占位：当前返 null（drift-backlog §7.B B.phase187-resolve-handoff-via-dialog-store）', () => {
    // ⚠️ Step C 实施后改本 case expected：返 marker | null per 持久化策略
    expect(resolveHandoffMarker('any-id')).toBe(null);
  });
});
