/**
 * phase 247 Step A — memory dream-state save invariant tests
 *
 * 覆盖 assertDreamStateShape 共享 helper + 2 子模块 shape check + save 集成。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  assertDreamStateShape,
  type DreamSaveSource,
} from '../../../src/core/memory/invariants.js';
import {
  __test_saveDreamState,
  __test_DEEP_DREAM_STATE_FILE,
  type __test_DreamStateData,
} from '../../../src/core/memory/deep-dream.js';
import {
  __test_saveRandomDreamState,
  __test_RANDOM_DREAM_STATE_FILE,
} from '../../../src/core/memory/random-dream.js';
import { makeMockAudit } from '../../helpers/audit.js';
import { MEMORY_AUDIT_EVENTS } from '../../../src/core/memory/audit-events.js';
import type { FileSystem } from '../../../src/foundation/fs/types.js';

function makeMockFsForWrite(writeImpl?: (file: string, content: string) => void): FileSystem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { writeAtomicSync: vi.fn(writeImpl ?? (() => {})) } as any;
}

describe('memory dream-state save invariant (phase 247 Step A)', () => {
  describe('共享 helper', () => {
    it('state=null → emit kind=state_not_object', () => {
      const audit = makeMockAudit();
      assertDreamStateShape(null, audit, 'deep_dream_save');
      expect(audit.write).toHaveBeenCalledTimes(1);
      const call = (audit.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED);
      expect(call).toEqual(expect.arrayContaining([
        expect.stringMatching(/^kind=state_not_object$/),
        expect.stringMatching(/^source=deep_dream_save$/),
      ]));
    });

    it('state=undefined → emit kind=state_not_object', () => {
      const audit = makeMockAudit();
      assertDreamStateShape(undefined, audit, 'random_dream_save');
      expect(audit.write).toHaveBeenCalledTimes(1);
      const call = (audit.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED);
      expect(call).toEqual(expect.arrayContaining([
        expect.stringMatching(/^kind=state_not_object$/),
        expect.stringMatching(/^source=random_dream_save$/),
      ]));
    });

    it('state=number → emit kind=state_not_object', () => {
      const audit = makeMockAudit();
      assertDreamStateShape(42, audit, 'deep_dream_save');
      expect(audit.write).toHaveBeenCalledTimes(1);
      const call = (audit.write as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED);
      expect(call).toEqual(expect.arrayContaining([
        expect.stringMatching(/^kind=state_not_object$/),
        expect.stringMatching(/^actual=number$/),
      ]));
    });

    it('state=array → 走入 record 后字段缺失会 trigger 子模块 check', () => {
      // typeof array == 'object' 且 !== null，所以走入子模块 check
      const audit = makeMockAudit();
      assertDreamStateShape([], audit, 'deep_dream_save');
      // processedArchives 缺失 → not_array
      expect(audit.write).toHaveBeenCalled();
      const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(c => c[1]?.includes('deep_processedArchives_not_array'))).toBe(true);
    });
  });

  describe('deep_dream_save', () => {
    describe('processedArchives', () => {
      it('合法 string[] → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: ['a.json', 'b.json'], currentSessionDreamedDate: '' }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('空数组 → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '' }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('非数组 → emit kind=deep_processedArchives_not_array', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: 'nope', currentSessionDreamedDate: '' }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_processedArchives_not_array')
        )).toBe(true);
      });

      it('数组含非 string 元素 → emit kind=deep_processedArchives_element_not_string + idx', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: ['a', 123, 'b'], currentSessionDreamedDate: '' }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_processedArchives_element_not_string') &&
          c.some((s: unknown) => typeof s === 'string' && s.includes('idx=1'))
        )).toBe(true);
      });
    });

    describe('currentSessionDreamedDate', () => {
      it('空字符串 → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '' }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('合法 YYYY-MM-DD → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '2026-05-30' }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('非 string → emit kind=deep_currentSessionDreamedDate_not_string', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: 42 }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_currentSessionDreamedDate_not_string')
        )).toBe(true);
      });

      it('错格式 "abc" → emit kind=deep_currentSessionDreamedDate_invalid_format', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: 'abc' }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_currentSessionDreamedDate_invalid_format')
        )).toBe(true);
      });

      it('错格式 "2026-13-99" → 0 emit (regex 仅形态、不验 calendar logic)', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '2026-13-99' }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });
    });

    describe('currentSessionRetryCount', () => {
      it('undefined → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '' }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('0 → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '', currentSessionRetryCount: 0 }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('正整数 → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '', currentSessionRetryCount: 5 }, audit, 'deep_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('负数 → emit kind=deep_currentSessionRetryCount_invalid', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '', currentSessionRetryCount: -1 }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_currentSessionRetryCount_invalid')
        )).toBe(true);
      });

      it('小数 → emit kind=deep_currentSessionRetryCount_invalid', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '', currentSessionRetryCount: 1.5 }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_currentSessionRetryCount_invalid')
        )).toBe(true);
      });

      it('非 number → emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedArchives: [], currentSessionDreamedDate: '', currentSessionRetryCount: '2' }, audit, 'deep_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('deep_currentSessionRetryCount_invalid')
        )).toBe(true);
      });
    });
  });

  describe('random_dream_save', () => {
    describe('processedContractIds', () => {
      it('合法 string[] → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedContractIds: ['a', 'b'] }, audit, 'random_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('空数组 → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedContractIds: [] }, audit, 'random_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('非数组 → emit kind=random_processedContractIds_not_array', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedContractIds: 'nope' }, audit, 'random_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('random_processedContractIds_not_array')
        )).toBe(true);
      });

      it('含非 string → emit kind=random_processedContractIds_element_not_string', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedContractIds: ['a', 42] }, audit, 'random_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('random_processedContractIds_element_not_string')
        )).toBe(true);
      });
    });

    describe('pendingLateSettle', () => {
      it('undefined → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedContractIds: [] }, audit, 'random_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('合法 entry 数组 → 0 emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({
          processedContractIds: [],
          pendingLateSettle: [{ taskId: 't1', scheduledAt: 1, expectedTimeoutAt: 2 }],
        }, audit, 'random_dream_save');
        expect(audit.write).not.toHaveBeenCalled();
      });

      it('非数组 → emit kind=random_pendingLateSettle_not_array', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({ processedContractIds: [], pendingLateSettle: 'nope' }, audit, 'random_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('random_pendingLateSettle_not_array')
        )).toBe(true);
      });

      it('entry 缺 taskId → emit kind=random_pendingLateSettle_entry_invalid + idx', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({
          processedContractIds: [],
          pendingLateSettle: [{ scheduledAt: 1, expectedTimeoutAt: 2 }],
        }, audit, 'random_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('random_pendingLateSettle_entry_invalid') &&
          c.some((s: unknown) => typeof s === 'string' && s.includes('idx=0'))
        )).toBe(true);
      });

      it('entry scheduledAt 非 number → emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({
          processedContractIds: [],
          pendingLateSettle: [{ taskId: 't1', scheduledAt: '1', expectedTimeoutAt: 2 }],
        }, audit, 'random_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('random_pendingLateSettle_entry_invalid')
        )).toBe(true);
      });

      it('entry expectedTimeoutAt 非 number → emit', () => {
        const audit = makeMockAudit();
        assertDreamStateShape({
          processedContractIds: [],
          pendingLateSettle: [{ taskId: 't1', scheduledAt: 1, expectedTimeoutAt: '2' }],
        }, audit, 'random_dream_save');
        const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.some(c =>
          c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED &&
          c[1]?.includes('random_pendingLateSettle_entry_invalid')
        )).toBe(true);
      });
    });
  });

  describe('saveDreamState 集成', () => {
    it('合法 state → 0 emit + 文件落盘', () => {
      const writes: Array<[string, string]> = [];
      const fs = makeMockFsForWrite((file, content) => { writes.push([file, content]); });
      const audit = makeMockAudit();

      const state: __test_DreamStateData = {
        processedArchives: ['x.json'],
        currentSessionDreamedDate: '2026-05-30',
      };
      __test_saveDreamState(fs, state, audit, 'test-claw');

      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toBe(__test_DEEP_DREAM_STATE_FILE);
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('非法 state → 文件仍落盘（F36 保 progress）+ audit emit', () => {
      const writes: Array<[string, string]> = [];
      const fs = makeMockFsForWrite((file, content) => { writes.push([file, content]); });
      const audit = makeMockAudit();

      const state = { processedArchives: 'bad', currentSessionDreamedDate: 42 } as unknown as __test_DreamStateData;
      __test_saveDreamState(fs, state, audit, 'test-claw');

      expect(writes).toHaveLength(1);
      expect(audit.write).toHaveBeenCalled();
      const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.every(c => c[0] === MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED)).toBe(true);
    });
  });

  describe('saveRandomDreamState 集成', () => {
    it('合法 state → 0 emit + 文件落盘', () => {
      const writes: Array<[string, string]> = [];
      const fs = makeMockFsForWrite((file, content) => { writes.push([file, content]); });
      const audit = makeMockAudit();

      __test_saveRandomDreamState(fs, { processedContractIds: ['c1'] }, audit);

      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toBe('.random-dream-state.json');
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('非法 state → 文件仍落盘 + audit emit + 保 throw on IO 错', () => {
      const writes: Array<[string, string]> = [];
      const fs = makeMockFsForWrite(() => { throw new Error('ENOSPC'); });
      const audit = makeMockAudit();

      const state = { processedContractIds: 'bad' } as unknown as { processedContractIds: string[] };
      expect(() => __test_saveRandomDreamState(fs, state, audit)).toThrow('ENOSPC');

      expect(writes).toHaveLength(0);
      const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls;
      // 先 invariant 违例、后 IO error
      expect(calls[0][0]).toBe(MEMORY_AUDIT_EVENTS.MEMORY_DREAM_INVARIANT_VIOLATED);
      expect(calls[1][0]).toBe(MEMORY_AUDIT_EVENTS.RANDOM_DREAM_ERROR);
    });
  });
});
