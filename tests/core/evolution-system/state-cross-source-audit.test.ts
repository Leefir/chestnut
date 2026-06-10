import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { auditEvolutionStateCrossSource } from '../../../src/core/evolution-system/state-cross-source-audit.js';
import { EvolutionSystem } from '../../../src/core/evolution-system/system.js';
import { RETRO_AUDIT_EVENTS } from '../../../src/core/evolution-system/retro-audit-events.js';
import { NodeFileSystem } from '../../../src/foundation/fs/node-fs.js';

// ============================================================================
// Helpers
// ============================================================================
function createMockAudit() {
  return {
    write: vi.fn(),
    preview: vi.fn((s: string) => s),
    message: vi.fn((s: string) => s),
    summary: vi.fn((s: string) => s),
    __brand: 'AuditLog' as const,
  };
}

async function setupEvolutionSystem(overrides?: {
  listArchiveContractIds?: () => Promise<string[]>;
  processedContractIds?: Set<string>;
}) {
  const tmpBase = path.join(os.tmpdir(), `phase253b-${randomUUID()}`);
  const motionDir = path.join(tmpBase, 'motion');
  await fs.mkdir(path.join(motionDir, 'clawspace', 'pending-retrospective', 'by-contract'), { recursive: true });
  await fs.mkdir(path.join(motionDir, 'clawspace', 'dispatch-skills'), { recursive: true });

  const motionFs = new NodeFileSystem({ baseDir: motionDir });
  const mockAudit = createMockAudit();
  const evolutionSystem = new EvolutionSystem({
    fs: motionFs,
    audit: mockAudit as any,
    taskSystem: { schedule: vi.fn().mockResolvedValue('mock-task-id') } as any,
    contractManager: {} as any,
    listArchiveContractIds: overrides?.listArchiveContractIds,
  });

  if (overrides?.processedContractIds) {
    (evolutionSystem as any).processedContractIds = overrides.processedContractIds;
  }

  return { motionDir, evolutionSystem, mockAudit };
}

async function cleanup(tmpBase: string) {
  await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
}

// ============================================================================
// Unit tests: auditEvolutionStateCrossSource
// ============================================================================
describe('evolution-system state cross-source audit (phase 253 Step B)', () => {
  let mockAudit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAudit = createMockAudit();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('EC-1: processedContractIds ⊆ archives', () => {
    it('完全 subset → 0 emit', async () => {
      await auditEvolutionStateCrossSource(
        { processedContractIds: ['a', 'b'] },
        async () => ['a', 'b', 'c'],
        mockAudit as any,
      );
      const calls = mockAudit.write.mock.calls.filter(
        (c: any[]) => c[0] === RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH
      );
      expect(calls).toHaveLength(0);
    });

    it('processedContractIds=空 + archives 非空 → 0 emit', async () => {
      await auditEvolutionStateCrossSource(
        { processedContractIds: [] },
        async () => ['a', 'b'],
        mockAudit as any,
      );
      const calls = mockAudit.write.mock.calls.filter(
        (c: any[]) => c[0] === RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH
      );
      expect(calls).toHaveLength(0);
    });

    it('processedContractIds 含 1 orphan → emit ec1_orphan + orphan_ids', async () => {
      await auditEvolutionStateCrossSource(
        { processedContractIds: ['a', 'orphan1'] },
        async () => ['a'],
        mockAudit as any,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH,
        `kind=ec1_processedContractIds_orphan`,
        `orphan_ids=orphan1`,
        `orphan_count=1`,
        `archive_total=1`,
      );
    });

    it('orphan 数 > 5 → orphan_ids 截断前 5 + orphan_count 完整', async () => {
      await auditEvolutionStateCrossSource(
        { processedContractIds: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'] },
        async () => [],
        mockAudit as any,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH,
        `kind=ec1_processedContractIds_orphan`,
        `orphan_ids=o1,o2,o3,o4,o5`,
        `orphan_count=6`,
        `archive_total=0`,
      );
    });
  });

  describe('archive list 失败降级', () => {
    it('listArchiveContractIds throw → emit _skipped', async () => {
      await auditEvolutionStateCrossSource(
        { processedContractIds: ['a'] },
        async () => { throw new Error('disk err'); },
        mockAudit as any,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_SKIPPED,
        `kind=ec1_skip`, `reason=list_archive_contracts_failed`,
        `error=disk err`,
      );
    });
  });

  describe('_saveState 集成', () => {
    let fixtures: Awaited<ReturnType<typeof setupEvolutionSystem>>;

    afterEach(async () => {
      if (fixtures?.motionDir) {
        await cleanup(path.dirname(fixtures.motionDir));
      }
    });

    it('合法 state + 合法 archives → 0 emit + 文件落盘', async () => {
      fixtures = await setupEvolutionSystem({
        listArchiveContractIds: async () => ['c-' + randomUUID()],
        processedContractIds: new Set(),
      });
      const { motionDir, evolutionSystem, mockAudit } = fixtures;

      await (evolutionSystem as any)._saveState();

      const statePath = path.join(motionDir, '.evolution-system-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);
      expect(state.version).toBe(1);

      const mismatchCalls = mockAudit.write.mock.calls.filter(
        (c: any[]) => c[0] === RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH
      );
      expect(mismatchCalls).toHaveLength(0);
    });

    it('orphan state → 文件仍落盘 + audit emit', async () => {
      fixtures = await setupEvolutionSystem({
        listArchiveContractIds: async () => ['only-archive'],
        processedContractIds: new Set(['only-archive', 'orphan-id']),
      });
      const { motionDir, evolutionSystem, mockAudit } = fixtures;

      await (evolutionSystem as any)._saveState();

      const statePath = path.join(motionDir, '.evolution-system-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);
      expect(state.processedContractIds).toContain('orphan-id');

      expect(mockAudit.write).toHaveBeenCalledWith(
        RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH,
        `kind=ec1_processedContractIds_orphan`,
        `orphan_ids=orphan-id`,
        `orphan_count=1`,
        `archive_total=1`,
      );
    });

    it('未传 listArchiveContractIds 参数 → skip cross-source + Step A schema 仍跑', async () => {
      fixtures = await setupEvolutionSystem();
      const { motionDir, evolutionSystem, mockAudit } = fixtures;

      await (evolutionSystem as any)._saveState();

      const statePath = path.join(motionDir, '.evolution-system-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);
      expect(state.version).toBe(1);

      // cross-source 未触发
      const mismatchCalls = mockAudit.write.mock.calls.filter(
        (c: any[]) => c[0] === RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH
      );
      expect(mismatchCalls).toHaveLength(0);

      const skipCalls = mockAudit.write.mock.calls.filter(
        (c: any[]) => c[0] === RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_SKIPPED
      );
      expect(skipCalls).toHaveLength(0);
    });
  });

  describe('fire-and-forget 模式', () => {
    let fixtures: Awaited<ReturnType<typeof setupEvolutionSystem>>;

    afterEach(async () => {
      if (fixtures?.motionDir) {
        await cleanup(path.dirname(fixtures.motionDir));
      }
    });

    it('cross-source audit throw → 主路径不 throw、不阻 save', async () => {
      fixtures = await setupEvolutionSystem({
        listArchiveContractIds: async () => { throw new Error('boom'); },
      });
      const { motionDir, evolutionSystem } = fixtures;

      // 不抛、文件落盘
      await expect((evolutionSystem as any)._saveState()).resolves.toBeUndefined();

      const statePath = path.join(motionDir, '.evolution-system-state.json');
      const content = await fs.readFile(statePath, 'utf-8');
      expect(JSON.parse(content).version).toBe(1);
    });
  });
});
