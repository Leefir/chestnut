/**
 * Phase 1036 — search.ts walk signal observance reverse test
 *
 * Verify that an aborted AbortSignal interrupts walk recursion
 * and causes graceful return (0 matches) instead of continuing the search.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { promises as fs } from 'fs';
import { searchTool } from '../../../src/foundation/file-tool/index.js';
import { ExecContextImpl } from '../../../src/foundation/tools/context.js';
import { NodeFileSystem } from '../../../src/foundation/fs/index.js';
import { createClawPermissionChecker } from '../../../src/core/permissions/claw-permissions.js';
import { createTempDir, cleanupTempDir } from '../../utils/temp.js';

describe('phase 1036: search.ts walk signal observance (F-4)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('walk finds matches without abort signal', async () => {
    const clawDir = path.join(tempDir, 'claw');
    const clawspaceDir = path.join(clawDir, 'clawspace');
    await fs.mkdir(clawspaceDir, { recursive: true });
    await fs.writeFile(path.join(clawspaceDir, 'note.txt'), 'needle in haystack');

    const mockFs = new NodeFileSystem({ baseDir: clawDir });
    const ctx = new ExecContextImpl({
      clawId: 'claw',
      clawDir,
      syncDir: path.join(clawDir, 'tasks/sync'),
      profile: 'full',
      fs: mockFs,
      permissionChecker: createClawPermissionChecker({ clawDir, strict: true }),
    });

    const result = await searchTool.execute(
      { text: 'needle', path: 'clawspace' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.content).toContain('needle');
  });

  it('aborted signal interrupts walk recursion (反向 1)', async () => {
    const clawDir = path.join(tempDir, 'claw');
    const clawspaceDir = path.join(clawDir, 'clawspace');
    await fs.mkdir(clawspaceDir, { recursive: true });
    await fs.writeFile(path.join(clawspaceDir, 'note.txt'), 'needle in haystack');

    const controller = new AbortController();
    controller.abort();

    const mockFs = new NodeFileSystem({ baseDir: clawDir });
    const ctx = new ExecContextImpl({
      clawId: 'claw',
      clawDir,
      syncDir: path.join(clawDir, 'tasks/sync'),
      profile: 'full',
      fs: mockFs,
      signal: controller.signal,
      permissionChecker: createClawPermissionChecker({ clawDir, strict: true }),
    });

    const result = await searchTool.execute(
      { text: 'needle', path: 'clawspace' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.content).toBe('No matches for "needle".');
  });
});
