/**
 * Builtin spawn tool tests (phase 1352 split)
 *
 * Extracted from builtins.test.ts:1018-1047 (spawn tool describe / 1 test).
 * spawn tool tests need vi.mock for writePendingSubagentTaskFile → keeps isolated.
 *
 * Remaining builtins.test.ts becomes mock-free → eligible for fast project.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { promises as fs } from 'fs';
import { spawnTool } from '../../src/core/spawn-system/index.js';
import { createClawPermissionChecker } from '../../src/core/permissions/claw-permissions.js';
import { ExecContextImpl } from '../../src/foundation/tools/context.js';
import { NodeFileSystem } from '../../src/foundation/fs/index.js';
import { OutboxWriter } from '../../src/foundation/messaging/index.js';
import { makeAudit } from '../helpers/audit.js';
import { createTempDir, cleanupTempDir } from '../utils/temp.js';

const { mockWriteFile } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(),
}));

vi.mock('../../src/core/async-task-system/tools/_pending-task-writer.js', () => ({
  writePendingSubagentTaskFile: mockWriteFile,
}));

describe('Builtin Tools - spawn tool', () => {
  let tempDir: string;
  let mockFs: NodeFileSystem;
  let outboxWriter: OutboxWriter;

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockWriteFile.mockClear();
    tempDir = await createTempDir();
    await fs.mkdir(path.join(tempDir, 'clawspace'), { recursive: true });
    mockFs = new NodeFileSystem({ baseDir: tempDir });
    outboxWriter = new OutboxWriter('test-claw', tempDir, mockFs, makeAudit().audit);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should pass maxSteps from context', async () => {
    mockWriteFile.mockResolvedValue('task-xxx');

    const ctxWithMaxSteps = new ExecContextImpl({
      clawId: 'test-claw',
      clawDir: tempDir,
      profile: 'full',
      fs: mockFs,
      fsFactory: (dir: string) => new NodeFileSystem({ baseDir: dir }),
      outboxWriter,
      maxSteps: 42,
      permissionChecker: createClawPermissionChecker({ clawDir: tempDir, strict: true }),
    });

    const result = await spawnTool.execute({
      intent: 'test task',
    }, ctxWithMaxSteps);

    expect(result.success).toBe(true);
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockWriteFile.mock.calls[0][2].maxSteps).toBe(42);
    expect(mockWriteFile.mock.calls[0][2].intent).toBe('test task');
  });
});
