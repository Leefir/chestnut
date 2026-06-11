import { describe, it, expect } from 'vitest';
import { assertSnapshotStateShape } from '../../../src/foundation/snapshot/invariants.js';
import { SNAPSHOT_AUDIT_EVENTS } from '../../../src/foundation/snapshot/audit-events.js';
import { makeMockAudit } from '../../helpers/audit.js';

describe('snapshot state shape invariant (phase 275 Step A)', () => {
  describe('state 根 check', () => {
    it('state=null → emit kind=state_not_object', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape(null, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=state_not_object',
        'actual=object',
      );
    });

    it('state=42 → emit kind=state_not_object', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape(42, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=state_not_object',
        'actual=number',
      );
    });

    it('state=字符串 → emit kind=state_not_object', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape('bad', audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=state_not_object',
        'actual=string',
      );
    });
  });

  describe('consecutiveFailures', () => {
    it('合法 number finite → 0 emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 1 }, audit);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('0 → 0 emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 0 }, audit);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('NaN → emit kind=consecutiveFailures_invalid', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: NaN }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=consecutiveFailures_invalid',
        'actual=NaN',
      );
    });

    it('Infinity → emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: Infinity }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=consecutiveFailures_invalid',
        'actual=Infinity',
      );
    });

    it('-Infinity → emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: -Infinity }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=consecutiveFailures_invalid',
        'actual=-Infinity',
      );
    });

    it('字符串 → emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: '3' }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=consecutiveFailures_invalid',
        'actual=3',
      );
    });

    it('undefined → emit (required)', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({}, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=consecutiveFailures_invalid',
        'actual=undefined',
      );
    });
  });

  describe('degradedAt', () => {
    it('undefined → 0 emit (optional)', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 0 }, audit);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('合法 number → 0 emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 0, degradedAt: 12345 }, audit);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('NaN → emit kind=degradedAt_invalid', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 0, degradedAt: NaN }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=degradedAt_invalid',
        'actual=NaN',
      );
    });

    it('Infinity → emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 0, degradedAt: Infinity }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=degradedAt_invalid',
        'actual=Infinity',
      );
    });

    it('字符串 → emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 0, degradedAt: 'now' }, audit);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=degradedAt_invalid',
        'actual=now',
      );
    });
  });

  describe('多违例独立 emit', () => {
    it('consecutiveFailures + degradedAt 均非法 → 2 emit', () => {
      const audit = makeMockAudit();
      assertSnapshotStateShape({ consecutiveFailures: 'bad', degradedAt: 'worse' }, audit);
      expect(audit.write).toHaveBeenCalledTimes(2);
      expect(audit.write).toHaveBeenNthCalledWith(
        1,
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=consecutiveFailures_invalid',
        'actual=bad',
      );
      expect(audit.write).toHaveBeenNthCalledWith(
        2,
        SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
        'kind=degradedAt_invalid',
        'actual=worse',
      );
    });
  });
});
