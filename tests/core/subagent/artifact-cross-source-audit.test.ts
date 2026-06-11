/**
 * Phase 270 Step B: subagent multi-artifact completeness cross-source audit tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  auditSubagentArtifactCompleteness,
  type ArtifactSnapshot,
  type ArtifactDeps,
} from '../../../src/core/subagent/artifact-cross-source-audit.js';
import { SUBAGENT_AUDIT_EVENTS } from '../../../src/core/subagent/audit-events.js';

function makeMockFs(overrides: {
  exists?: Record<string, boolean>;
  read?: Record<string, string>;
  readThrow?: string;
} = {}) {
  // Default daemon.log present and complete so AC-5 doesn't trip unless explicitly testing it
  const defaultExists: Record<string, boolean> = {
    '/tmp/results/test-agent/daemon.log': true,
  };
  const defaultRead: Record<string, string> = {
    '/tmp/results/test-agent/daemon.log': '=== SubAgent test-agent started ===\n=== Completed in 100ms ===',
  };
  return {
    exists: vi.fn(async (p: string) => {
      if (overrides.exists?.[p] !== undefined) return overrides.exists[p];
      return defaultExists[p] ?? false;
    }),
    read: vi.fn(async (p: string) => {
      if (overrides.readThrow && p.includes(overrides.readThrow)) throw new Error('read error');
      if (overrides.read?.[p] !== undefined) return overrides.read[p];
      if (defaultRead[p] !== undefined) return defaultRead[p];
      throw new Error('ENOENT');
    }),
  } as unknown as ArtifactDeps['fs'];
}

function makeMockMessageStore(overrides: { messages?: any[]; loadThrow?: boolean } = {}) {
  return {
    load: vi.fn(async () => {
      if (overrides.loadThrow) throw new Error('load error');
      return {
        session: {
          messages: overrides.messages ?? [],
        },
      };
    }),
  } as unknown as ArtifactDeps['messageStore'];
}

function makeMockAudit() {
  return {
    write: vi.fn(),
  };
}

function makeSnapshot(partial: Partial<ArtifactSnapshot> = {}): ArtifactSnapshot {
  return {
    agentId: 'test-agent',
    resultDir: '/tmp/results/test-agent',
    turnStartCount: 0,
    turnEndCount: 0,
    textEndCount: 0,
    auditStepCount: 0,
    ...partial,
  };
}

describe('subagent multi-artifact completeness audit (phase 270 Step B)', () => {
  describe('AC-2: turn pair', () => {
    it('start=2 end=2 → 0 emit', async () => {
      const audit = makeMockAudit();
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ turnStartCount: 2, turnEndCount: 2 }),
        { fs: makeMockFs(), messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('start=2 end=1 → emit ac2', async () => {
      const audit = makeMockAudit();
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ turnStartCount: 2, turnEndCount: 1 }),
        { fs: makeMockFs(), messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH);
      expect(audit.write.mock.calls[0]).toContain('kind=ac2_turn_pair_unbalanced');
    });

    it('start=0 end=0 → 0 emit', async () => {
      const audit = makeMockAudit();
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ turnStartCount: 0, turnEndCount: 0 }),
        { fs: makeMockFs(), messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });
  });

  describe('AC-3: steps.jsonl lines vs audit count', () => {
    it('lines=3 count=3 → 0 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/steps.jsonl': true },
        read: { '/tmp/results/test-agent/steps.jsonl': '{"s":1}\n{"s":2}\n{"s":3}\n' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 3 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('lines=3 count=5 → emit ac3', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/steps.jsonl': true },
        read: { '/tmp/results/test-agent/steps.jsonl': '{"s":1}\n{"s":2}\n{"s":3}\n' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 5 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH);
      expect(audit.write.mock.calls[0]).toContain('kind=ac3_steps_line_count_mismatch');
    });

    it('steps.jsonl 不存在 + count=0 → 0 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({ exists: { '/tmp/results/test-agent/steps.jsonl': false } });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 0 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('fs.read throw → emit _skipped ac3_skip', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({ exists: { '/tmp/results/test-agent/steps.jsonl': true }, readThrow: 'steps.jsonl' });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 3 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_SKIPPED);
      expect(audit.write.mock.calls[0]).toContain('kind=ac3_skip');
    });
  });

  describe('AC-4: textEnd vs last assistant', () => {
    it('textend=1 + 末轮 assistant 含 text → 0 emit', async () => {
      const audit = makeMockAudit();
      const messageStore = makeMockMessageStore({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
        ],
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ textEndCount: 1 }),
        { fs: makeMockFs(), messageStore },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('textend=1 + 末轮 assistant string content → 0 emit', async () => {
      const audit = makeMockAudit();
      const messageStore = makeMockMessageStore({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ textEndCount: 1 }),
        { fs: makeMockFs(), messageStore },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('textend=1 + 末轮 user → emit ac4', async () => {
      const audit = makeMockAudit();
      const messageStore = makeMockMessageStore({
        messages: [
          { role: 'user', content: 'hi' },
        ],
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ textEndCount: 1 }),
        { fs: makeMockFs(), messageStore },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH);
      expect(audit.write.mock.calls[0]).toContain('kind=ac4_textend_without_last_assistant_text');
    });

    it('textend=0 → 不 check (skip silent)', async () => {
      const audit = makeMockAudit();
      const messageStore = makeMockMessageStore({
        messages: [{ role: 'user', content: 'hi' }],
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ textEndCount: 0 }),
        { fs: makeMockFs(), messageStore },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('messageStore.load throw → emit _skipped ac4_skip', async () => {
      const audit = makeMockAudit();
      const messageStore = makeMockMessageStore({ loadThrow: true });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ textEndCount: 1 }),
        { fs: makeMockFs(), messageStore },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_SKIPPED);
      expect(audit.write.mock.calls[0]).toContain('kind=ac4_skip');
    });
  });

  describe('AC-5: daemon.log content', () => {
    it('含 started + Completed → 0 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/daemon.log': true },
        read: { '/tmp/results/test-agent/daemon.log': '=== SubAgent test-agent started ===\n=== Completed in 100ms ===' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot(),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('含 started + Error → 0 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/daemon.log': true },
        read: { '/tmp/results/test-agent/daemon.log': '=== SubAgent test-agent started ===\n=== Error: something ===' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot(),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('只 started 缺末尾 → emit ac5_incomplete', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/daemon.log': true },
        read: { '/tmp/results/test-agent/daemon.log': '=== SubAgent test-agent started ===' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot(),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH);
      expect(audit.write.mock.calls[0]).toContain('kind=ac5_daemon_log_incomplete');
    });

    it('文件不存在 → emit ac5_missing', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({ exists: { '/tmp/results/test-agent/daemon.log': false } });
      await auditSubagentArtifactCompleteness(
        makeSnapshot(),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH);
      expect(audit.write.mock.calls[0]).toContain('kind=ac5_daemon_log_missing');
    });

    it('fs.read throw → emit _skipped ac5_skip', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({ exists: { '/tmp/results/test-agent/daemon.log': true }, readThrow: 'daemon.log' });
      await auditSubagentArtifactCompleteness(
        makeSnapshot(),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(audit.write.mock.calls[0][0]).toBe(SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_SKIPPED);
      expect(audit.write.mock.calls[0]).toContain('kind=ac5_skip');
    });
  });

  describe('AC-6: audit step > 0 vs steps.jsonl 存在', () => {
    it('count=0 + 文件不存在 → 0 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({ exists: { '/tmp/results/test-agent/steps.jsonl': false } });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 0 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('count=3 + 文件存在 → 0 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/steps.jsonl': true },
        read: { '/tmp/results/test-agent/steps.jsonl': '{"s":1}\n{"s":2}\n{"s":3}\n' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 3 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('count=3 + 文件不存在 → emit ac3 + ac6', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({ exists: { '/tmp/results/test-agent/steps.jsonl': false } });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ auditStepCount: 3 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      expect(audit.write).toHaveBeenCalledTimes(2);
      const kinds = audit.write.mock.calls.map((c: any[]) => c.find((x: string) => x?.startsWith('kind=')));
      expect(kinds).toContain('kind=ac3_steps_line_count_mismatch');
      expect(kinds).toContain('kind=ac6_steps_missing_with_audit_step');
    });
  });

  describe('multiple checks', () => {
    it('AC-2 和 AC-3 同时 trip → 各独立 emit', async () => {
      const audit = makeMockAudit();
      const fs = makeMockFs({
        exists: { '/tmp/results/test-agent/steps.jsonl': true },
        read: { '/tmp/results/test-agent/steps.jsonl': '{"s":1}\n' },
      });
      await auditSubagentArtifactCompleteness(
        makeSnapshot({ turnStartCount: 2, turnEndCount: 1, auditStepCount: 3 }),
        { fs, messageStore: makeMockMessageStore() },
        audit as any,
      );
      const calls = audit.write.mock.calls;
      expect(calls.length).toBe(2);
      const kinds = calls.map((c: any[]) => c.find((x: string) => x?.startsWith('kind=')));
      expect(kinds).toContain('kind=ac2_turn_pair_unbalanced');
      expect(kinds).toContain('kind=ac3_steps_line_count_mismatch');
    });
  });
});
