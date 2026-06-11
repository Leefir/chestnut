import { describe, it, expect } from 'vitest';
import { auditSnapshotStateCrossSource } from '../../../src/foundation/snapshot/state-cross-source-audit.js';
import { SNAPSHOT_AUDIT_EVENTS } from '../../../src/foundation/snapshot/audit-events.js';
import { makeMockAudit } from '../../helpers/audit.js';

describe('snapshot state-internal cross-source audit (phase 275 Step B)', () => {
  describe('SC-1: consecutiveFailures >= 0 整数', () => {
    it('0 → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 0 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('正整数 → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 3 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('-1 → emit sc1', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: -1 }, audit, 1000);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
        'kind=sc1_consecutiveFailures_invalid',
        'actual=-1',
      );
    });

    it('小数 1.5 → emit sc1', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 1.5 }, audit, 1000);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
        'kind=sc1_consecutiveFailures_invalid',
        'actual=1.5',
      );
    });
  });

  describe('SC-2: degraded 状态语义一致', () => {
    it('degradedAt undefined + consecutiveFailures=0 → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 0 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('degradedAt set + consecutiveFailures=3 → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 3, degradedAt: 500 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('degradedAt set + consecutiveFailures=0 → emit sc2', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 0, degradedAt: 500 }, audit, 1000);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
        'kind=sc2_degraded_without_failures',
        'degradedAt=500',
        'consecutiveFailures=0',
      );
    });

    it('degradedAt set + consecutiveFailures=-1 → emit sc1 + sc2', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: -1, degradedAt: 500 }, audit, 1000);
      expect(audit.write).toHaveBeenCalledTimes(2);
      expect(audit.write).toHaveBeenNthCalledWith(
        1,
        SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
        'kind=sc1_consecutiveFailures_invalid',
        'actual=-1',
      );
      expect(audit.write).toHaveBeenNthCalledWith(
        2,
        SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
        'kind=sc2_degraded_without_failures',
        'degradedAt=500',
        'consecutiveFailures=-1',
      );
    });
  });

  describe('SC-3: degradedAt <= now', () => {
    it('degradedAt undefined → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 0 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('degradedAt < now → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 3, degradedAt: 500 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('degradedAt == now → 0 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 3, degradedAt: 1000 }, audit, 1000);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('degradedAt > now → emit sc3', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource({ consecutiveFailures: 3, degradedAt: 1500 }, audit, 1000);
      expect(audit.write).toHaveBeenCalledWith(
        SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
        'kind=sc3_degradedAt_in_future',
        'degradedAt=1500',
        'now=1000',
      );
    });
  });

  describe('3 check 同时 trip', () => {
    it('SC-1 + SC-2 + SC-3 全违例 → 3 emit', () => {
      const audit = makeMockAudit();
      auditSnapshotStateCrossSource(
        { consecutiveFailures: -1.5, degradedAt: 9999 },
        audit,
        1000,
      );
      expect(audit.write).toHaveBeenCalledTimes(3);
    });
  });
});
