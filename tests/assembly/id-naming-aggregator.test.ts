import { describe, it, expect } from 'vitest';
import {
  AggregatedIdNamingMap,
  lookupByAuditCol,
  type IdNamingEntry,
} from '../../src/assembly/id-naming-aggregator.js';

describe('id-naming-aggregator (phase 140 Step A)', () => {
  it('empty aggregator has no entries at Step A', () => {
    expect(Object.keys(AggregatedIdNamingMap).length).toBe(0);
  });

  it('lookupByAuditCol returns undefined for empty map', () => {
    expect(lookupByAuditCol('trace_id')).toBeUndefined();
    expect(lookupByAuditCol('')).toBeUndefined();
  });

  it('all entries have non-empty auditCol / tsField / cliFlag (static shape check)', () => {
    for (const [name, entry] of Object.entries(AggregatedIdNamingMap)) {
      expect(entry.auditCol).toMatch(/^[a-z_]+$/);
      expect(entry.tsField).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
      expect(typeof entry.cliFlag).toBe('string');
      expect(entry.cliFlag.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  it('auditCol values are unique', () => {
    const auditCols = Object.values(AggregatedIdNamingMap).map((e: IdNamingEntry) => e.auditCol);
    expect(new Set(auditCols).size).toBe(auditCols.length);
  });

  it('tsField values are unique', () => {
    const tsFields = Object.values(AggregatedIdNamingMap).map((e: IdNamingEntry) => e.tsField);
    expect(new Set(tsFields).size).toBe(tsFields.length);
  });
});
