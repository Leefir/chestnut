import { describe, it, expect } from 'vitest';
import {
  auditSummonDecisionCrossSource,
  auditSummonStateOrphan,
} from '../../../src/core/summon-system/cross-source-audit.js';
import { createSummonStateStore } from '../../../src/core/summon-system/summon-state-store.js';
import type { AuditLog } from '../../../src/foundation/audit/index.js';
import { NodeFileSystem } from '../../../src/foundation/fs/index.js';
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
  const dir = path.join(os.tmpdir(), `summon-cross-source-test-${randomUUID()}`);
  const fs = new NodeFileSystem({ baseDir: dir });
  await fs.ensureDir('summon-state');
  return { fs, dir };
}

describe('summon-state cross-source audit (phase 255 Step B)', () => {
  describe('SC-1: write decision.taskId ∈ universe', () => {
    it('taskId 在 universe → 0 emit', async () => {
      const audit = makeFakeAudit();
      const provider = async () => new Set(['t1', 't2']);
      await auditSummonDecisionCrossSource({ taskId: 't1' }, provider, audit);
      expect(audit.entries).toHaveLength(0);
    });

    it('taskId 不在 universe → emit sc1_orphan_taskId', async () => {
      const audit = makeFakeAudit();
      const provider = async () => new Set(['t2']);
      await auditSummonDecisionCrossSource({ taskId: 't1' }, provider, audit);
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][0]).toBe('summon_state_cross_source_mismatch');
      expect(audit.entries[0][1]).toContain('sc1_orphan_taskId');
      expect(audit.entries[0][2]).toContain('taskId=t1');
    });
  });

  describe('SC-1 provider 失败降级', () => {
    it('provider throw → emit sc1_skip', async () => {
      const audit = makeFakeAudit();
      const provider = async () => { throw new Error('universe down'); };
      await auditSummonDecisionCrossSource({ taskId: 't1' }, provider, audit);
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][0]).toBe('summon_state_cross_source_skipped');
      expect(audit.entries[0][1]).toContain('sc1_skip');
      expect(audit.entries[0][3]).toContain('reason=async_task_universe_failed');
      expect(audit.entries[0][4]).toContain('error=universe down');
    });
  });

  describe('SC-2: stateDir taskIds ⊆ universe', () => {
    it('完全 subset → 0 emit', async () => {
      const audit = makeFakeAudit();
      const provider = async () => new Set(['t1', 't2', 't3']);
      await auditSummonStateOrphan(new Set(['t1', 't2']), provider, audit);
      expect(audit.entries).toHaveLength(0);
    });

    it('1 orphan → emit sc2_orphan_summon_state', async () => {
      const audit = makeFakeAudit();
      const provider = async () => new Set(['t1']);
      await auditSummonStateOrphan(new Set(['t1', 't2']), provider, audit);
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][0]).toBe('summon_state_cross_source_mismatch');
      expect(audit.entries[0][1]).toContain('sc2_orphan_summon_state');
      expect(audit.entries[0][2]).toContain('orphan_ids=t2');
      expect(audit.entries[0][3]).toContain('orphan_count=1');
    });

    it('多 orphan → emit + orphan_ids 截断前 5 + orphan_count 完整', async () => {
      const audit = makeFakeAudit();
      const provider = async () => new Set(['t0']);
      await auditSummonStateOrphan(new Set(['t0', 't1', 't2', 't3', 't4', 't5', 't6']), provider, audit);
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][2]).toContain('orphan_ids=t1,t2,t3,t4,t5');
      expect(audit.entries[0][3]).toContain('orphan_count=6');
    });
  });

  describe('SC-2 provider 失败降级', () => {
    it('provider throw → emit sc2_skip', async () => {
      const audit = makeFakeAudit();
      const provider = async () => { throw new Error('scan failed'); };
      await auditSummonStateOrphan(new Set(['t1']), provider, audit);
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0][0]).toBe('summon_state_cross_source_skipped');
      expect(audit.entries[0][1]).toContain('sc2_skip');
      expect(audit.entries[0][2]).toContain('reason=async_task_universe_failed');
    });
  });

  describe('store write 集成（SC-1）', () => {
    it('合法 + provider 注入 + taskId ∈ universe → 0 emit + 文件落盘', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const provider = async () => new Set(['task-1']);
      const store = createSummonStateStore(fs, audit, provider);
      const decision = { taskId: 'task-1', verify: false, mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      expect(audit.entries.filter(e => e[0] === 'summon_state_cross_source_mismatch')).toHaveLength(0);
      const read = await store.read('task-1');
      expect(read).toBeDefined();
    });

    it('orphan taskId → 文件仍落盘 + audit emit', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const provider = async () => new Set(['other-task']);
      const store = createSummonStateStore(fs, audit, provider);
      const decision = { taskId: 'orphan-task', verify: false, mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      expect(audit.entries.some(e => e[0] === 'summon_state_cross_source_mismatch' && e[1]?.includes('sc1_orphan_taskId'))).toBe(true);
      const read = await store.read('orphan-task');
      expect(read).toBeDefined();
    });

    it('未注入 provider → skip cross-source + Step A schema 仍跑', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const store = createSummonStateStore(fs, audit); // no provider
      const decision = { taskId: 'task-1', verify: false, mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      expect(audit.entries.filter(e => e[0].startsWith('summon_state_cross_source'))).toHaveLength(0);
      const read = await store.read('task-1');
      expect(read).toBeDefined();
    });

    it('audit=undefined → skip cross-source（既有 audit-optional 契约）', async () => {
      const { fs } = await createTempFs();
      const provider = async () => new Set(['task-1']);
      const store = createSummonStateStore(fs, undefined, provider); // no audit
      const decision = { taskId: 'task-1', verify: false, mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      const read = await store.read('task-1');
      expect(read).toBeDefined();
    });
  });

  describe('fire-and-forget 模式', () => {
    it('cross-source audit throw → write 主路径不受影响', async () => {
      const { fs } = await createTempFs();
      const audit = makeFakeAudit();
      const provider = async () => { throw new Error('boom'); };
      const store = createSummonStateStore(fs, audit, provider);
      const decision = { taskId: 'task-1', verify: false, mode: 'shadow' as const, dispatchedAt: new Date().toISOString() };
      await store.write(decision);
      expect(audit.entries.some(e => e[0] === 'summon_state_cross_source_skipped')).toBe(true);
      const read = await store.read('task-1');
      expect(read).toBeDefined();
    });
  });
});
