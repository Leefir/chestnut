import { describe, it, expect } from 'vitest';
import { assertSummonDecisionShape } from '../../../src/core/summon-system/invariants.js';
import type { AuditLog } from '../../../src/foundation/audit/index.js';
import { NodeFileSystem } from '../../../src/foundation/fs/index.js';
import { createSummonStateStore } from '../../../src/core/summon-system/summon-state-store.js';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

function makeFakeAudit(): AuditLog & { entries: string[][] } {
  const entries: string[][] = [];
  return {
    entries,
    write(event: string, ...cols: string[]) {
      entries.push([event, ...cols]);
    },
  };
}

async function createTempFs() {
  const dir = path.join(os.tmpdir(), `summon-invariant-test-${randomUUID()}`);
  const fs = new NodeFileSystem({ baseDir: dir });
  await fs.ensureDir('summon-state');
  return { fs, dir };
}

describe('summon-state schema invariant (phase 255 Step A)', () => {
  describe('共享 helper 根 check', () => {
    it('decision=null → emit kind=decision_not_object', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape(null, audit, 'read');
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][0]).toBe('summon_state_invariant_violated');
      expect(audit.entries[0][1]).toContain('decision_not_object');
      expect(audit.entries[0][2]).toContain('direction=read');
    });

    it('decision=42 → emit kind=decision_not_object', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape(42, audit, 'write');
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][1]).toContain('decision_not_object');
      expect(audit.entries[0][2]).toContain('direction=write');
    });

    it('audit=undefined → no-op (audit-optional 契约)', () => {
      expect(() => assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z' }, undefined, 'read')).not.toThrow();
    });
  });

  describe('taskId', () => {
    it('合法 taskId 字符串 → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('taskId'))).toHaveLength(0);
    });

    it('taskId=42 → emit kind=taskId_not_string', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 42, verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('taskId_not_string'))).toBe(true);
    });

    it('taskId="" → emit kind=taskId_empty', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: '', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('taskId_empty'))).toBe(true);
    });
  });

  describe('verify', () => {
    it('verify=true → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('verify'))).toHaveLength(0);
    });

    it('verify=false → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: false, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('verify'))).toHaveLength(0);
    });

    it('verify="true" 字符串 → emit kind=verify_not_boolean', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: 'true', mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('verify_not_boolean'))).toBe(true);
    });
  });

  describe('targetClaw', () => {
    it('undefined → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('targetClaw'))).toHaveLength(0);
    });

    it('合法字符串 → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, targetClaw: 'claw-a', mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('targetClaw'))).toHaveLength(0);
    });

    it('数字 → emit kind=targetClaw_not_string', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, targetClaw: 123, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('targetClaw_not_string'))).toBe(true);
    });
  });

  describe('mode', () => {
    it('"shadow" → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('mode'))).toHaveLength(0);
    });

    it('"mining" → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'mining', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('mode'))).toHaveLength(0);
    });

    it('"invalid" → emit kind=mode_not_in_union', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'invalid', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('mode_not_in_union'))).toBe(true);
    });

    it('undefined → emit kind=mode_not_in_union', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('mode_not_in_union'))).toBe(true);
    });
  });

  describe('dispatchedAt', () => {
    it('合法 ISO timestamp → 0 emit', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00.000Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.filter(e => e[1]?.includes('dispatchedAt'))).toHaveLength(0);
    });

    it('非 string → emit kind=dispatchedAt_not_string', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: 42, schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('dispatchedAt_not_string'))).toBe(true);
    });

    it('错格式 "2026-01-01" → emit kind=dispatchedAt_not_iso', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: 't1', verify: true, mode: 'shadow', dispatchedAt: '2026-01-01', schema_version: 1 }, audit, 'read');
      expect(audit.entries.some(e => e[1]?.includes('dispatchedAt_not_iso'))).toBe(true);
    });
  });

  describe('direction 字段', () => {
    it('write 调用 → audit row 含 direction=write', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: '', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'write');
      expect(audit.entries.every(e => e.some(col => col.includes('direction=write')))).toBe(true);
    });

    it('read 调用 → audit row 含 direction=read', () => {
      const audit = makeFakeAudit();
      assertSummonDecisionShape({ taskId: '', verify: true, mode: 'shadow', dispatchedAt: '2024-01-01T00:00:00Z', schema_version: 1 }, audit, 'read');
      expect(audit.entries.every(e => e.some(col => col.includes('direction=read')))).toBe(true);
    });
  });

  describe('store write 集成', () => {
    it('合法 decision → 0 emit + 文件落盘', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit);
      const decision = { taskId: 'task-1', verify: false, targetClaw: 'test-claw', mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      const invariantEntries = audit.entries.filter(e => e[0] === 'summon_state_invariant_violated');
      expect(invariantEntries).toHaveLength(0);
      const read = await store.read('task-1');
      expect(read).toBeDefined();
    });

    it('非法 decision → 文件仍落盘 + audit emit + 保 IO 错既有 throw 路径', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit);
      const badDecision = { taskId: 'bad-task', verify: 'not-boolean', mode: 'shadow' as const, dispatchedAt: new Date().toISOString() } as unknown as { taskId: string; verify: boolean; mode: 'shadow' | 'mining'; dispatchedAt: string };
      await store.write(badDecision);
      expect(audit.entries.some(e => e[0] === 'summon_state_invariant_violated')).toBe(true);
      const read = await store.read('bad-task');
      expect(read).toBeDefined();
    });
  });

  describe('store read 集成', () => {
    it('合法文件 → 0 emit + 返 decision', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit);
      const decision = { taskId: 'task-1', verify: false, mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      audit.entries.length = 0;
      const read = await store.read('task-1');
      expect(read).toBeDefined();
      const invariantEntries = audit.entries.filter(e => e[0] === 'summon_state_invariant_violated');
      expect(invariantEntries).toHaveLength(0);
    });

    it('文件不存在 → 返 undefined + 0 emit', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit);
      const read = await store.read('nonexistent-task');
      expect(read).toBeUndefined();
      expect(audit.entries).toHaveLength(0);
    });

    it('文件 corrupt（缺 mode 字段）→ emit + 仍返 parsed（不破业务、不 silent suppress）', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit);
      await fs.writeAtomic('summon-state/corrupt-task.json', JSON.stringify({ taskId: 'corrupt-task', verify: true, dispatchedAt: new Date().toISOString(), schema_version: 1 }));
      const read = await store.read('corrupt-task');
      expect(read).toBeDefined();
      expect(audit.entries.some(e => e[0] === 'summon_state_invariant_violated' && e[1]?.includes('mode_not_in_union'))).toBe(true);
    });

    it('JSON parse 失败 → emit SUMMON_STATE_READ_FAILED + 返 undefined（保 fallback）', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit);
      await fs.writeAtomic('summon-state/bad-json.json', 'not json');
      const read = await store.read('bad-json');
      expect(read).toBeUndefined();
      expect(audit.entries.some(e => e[0] === 'summon_state_read_failed')).toBe(true);
    });
  });
});
