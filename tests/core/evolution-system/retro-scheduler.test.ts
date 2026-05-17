/**
 * retro-scheduler unit tests (phase 990 / r121 F fork)
 *
 * Tests scheduleRetro paths via mocked skill-system + prompt builder + pending writer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduleRetro } from '../../../src/core/evolution-system/retro-scheduler.js';
import type { RetroConfig } from '../../../src/core/evolution-system/retro-scheduler.js';
import type { FileSystem } from '../../../src/foundation/fs/types.js';
import type { AuditLog } from '../../../src/foundation/audit/index.js';

const { mockSkillLoadAll, mockSkillFormat, mockWritePending } = vi.hoisted(() => ({
  mockSkillLoadAll: vi.fn().mockResolvedValue(undefined),
  mockSkillFormat: vi.fn().mockReturnValue('No skills loaded'),
  mockWritePending: vi.fn().mockResolvedValue('mock-task-id'),
}));

vi.mock('../../../src/foundation/skill-system/registry.js', () => ({
  SkillSystem: vi.fn().mockImplementation(() => ({
    loadAll: mockSkillLoadAll,
    formatForContext: mockSkillFormat,
  })),
}));

vi.mock('../../../src/core/async-task-system/tools/_pending-task-writer.js', () => ({
  writePendingSubagentTaskFile: mockWritePending,
}));

function makeConfig(overrides: Partial<RetroConfig> = {}): RetroConfig {
  return {
    targetClaw: 'claw-test',
    contractId: 'c-1',
    contractYaml: 'yaml: true',
    motionFs: {} as unknown as FileSystem,
    motionAudit: { write: vi.fn() } as unknown as AuditLog,
    motionBaseDir: '/tmp/motion',
    baseMessages: [{ role: 'user', content: 'hi' }],
    audit: { write: vi.fn() } as unknown as AuditLog,
    ...overrides,
  };
}

describe('scheduleRetro (phase 990)', () => {
  beforeEach(() => {
    mockSkillLoadAll.mockClear();
    mockSkillFormat.mockClear().mockReturnValue('No skills loaded');
    mockWritePending.mockClear().mockResolvedValue('mock-task-id');
  });

  it('schedules retro with default timeout when skills empty', async () => {
    const config = makeConfig();
    await scheduleRetro(config);
    expect(mockSkillLoadAll).toHaveBeenCalled();
    expect(mockWritePending).toHaveBeenCalledWith(
      config.motionFs,
      config.motionAudit,
      expect.objectContaining({
        kind: 'subagent',
        intent: expect.stringContaining('yaml: true'),
        timeoutMs: 600000,
        parentClawId: 'motion',
        originClawId: 'motion',
      }),
    );
  });

  it('includes skills summary when skills loaded', async () => {
    mockSkillFormat.mockReturnValue('skillA, skillB');
    const config = makeConfig();
    await scheduleRetro(config);
    expect(mockWritePending).toHaveBeenCalledWith(
      config.motionFs,
      config.motionAudit,
      expect.objectContaining({
        intent: expect.stringContaining('skillA, skillB'),
      }),
    );
  });

  it('logs skill failure and continues when loadAll throws', async () => {
    mockSkillLoadAll.mockRejectedValue(new Error('disk full'));
    const config = makeConfig();
    await scheduleRetro(config);
    expect(config.audit.write).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('disk full'),
    );
    expect(mockWritePending).toHaveBeenCalled();
  });

  it('uses custom retroSubagentTimeoutMs when provided', async () => {
    const config = makeConfig({ retroSubagentTimeoutMs: 120000 });
    await scheduleRetro(config);
    expect(mockWritePending).toHaveBeenCalledWith(
      config.motionFs,
      config.motionAudit,
      expect.objectContaining({ timeoutMs: 120000 }),
    );
  });
});
