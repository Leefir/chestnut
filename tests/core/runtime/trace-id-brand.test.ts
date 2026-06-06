import { describe, it, expect } from 'vitest';
import { makeTraceId, type TraceId } from '../../../src/foundation/audit/types.js';

describe('TraceId brand (phase 140 Step B)', () => {
  it('makeTraceId returns a branded hex string', () => {
    const id = makeTraceId('7b922f1afc4859e5');
    expect(String(id)).toBe('7b922f1afc4859e5');
  });

  it('makeTraceId throws on empty string', () => {
    expect(() => makeTraceId('')).toThrow(/expected non-empty string/);
  });

  it('runtime equivalent to plain string (toString / String)', () => {
    const raw = 'aabbccdd11223344';
    const branded = makeTraceId(raw);
    expect(branded.toString()).toBe(raw);
    expect(String(branded)).toBe(raw);
    expect(typeof branded).toBe('string');
  });

  it('compile-time: factory-produced value passes through typed receiver', () => {
    const receive = (id: TraceId) => id;
    const branded = makeTraceId('deadbeefcafebabe');
    expect(receive(branded)).toBe(branded);
  });

  it('audit col literal unchanged after String() conversion', () => {
    const traceId = makeTraceId('0011223344556677');
    expect(`trace_id=${String(traceId)}`).toBe('trace_id=0011223344556677');
  });
});
