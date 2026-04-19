/**
 * Runtime.initialize() failure audit tests — phase155B
 *
 * Covers:
 * - inboxReader.init() failure → precise audit + rethrow
 *
 * 遗留：本文件 makeDeps helper 仍是 phase155B sync + 7 字段 + `dependencies: deps as any`
 * 形态。phase155C 新契约下 `as any` 是类型破口，应整体迁移到 makeRuntimeDeps
 *（tests/helpers/runtime-deps.ts）消除类型绕过。独立 phase 处理。
 */

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { ClawRuntime } from '../../src/core/runtime.js';
import { NodeFileSystem } from '../../src/foundation/fs/node-fs.js';
import { AuditWriter } from '../../src/foundation/audit/writer.js';
import { SessionManager } from '../../src/foundation/session-store/index.js';
import { Snapshot } from '../../src/foundation/snapshot/index.js';
import { SNAPSHOT_IGNORE_PATTERNS } from '../../src/foundation/snapshot/index.js';
import { InboxReader } from '../../src/foundation/messaging/index.js';
import { OutboxWriter } from '../../src/core/communication/index.js';

describe('Runtime.initialize() failure audits', () => {
  async function makeDeps(clawDir: string, overrides: { sessionManager?: SessionManager; inboxReader?: InboxReader } = {}) {
    const systemFs = new NodeFileSystem({ baseDir: clawDir, enforcePermissions: false });
    const clawFs = new NodeFileSystem({ baseDir: clawDir, enforcePermissions: true });
    const auditWriter = new AuditWriter(systemFs, 'audit.tsv', null);

    const snapshot = new Snapshot(clawDir, systemFs, auditWriter, SNAPSHOT_IGNORE_PATTERNS);
    vi.spyOn(snapshot, 'init').mockResolvedValue({ ok: true } as any);
    vi.spyOn(snapshot, 'commit').mockResolvedValue({ ok: true } as any);

    const sessionManager = overrides.sessionManager ?? new SessionManager(systemFs, 'dialog', auditWriter, 'test-claw');
    const inboxReader = overrides.inboxReader ?? new InboxReader('inbox/pending', 'inbox/done', 'inbox/failed', systemFs, auditWriter);
    const outboxWriter = new OutboxWriter('test-claw', clawDir, systemFs, auditWriter);

    return {
      systemFs, clawFs, auditWriter, snapshot, sessionManager, inboxReader, outboxWriter,
    };
  }

  it('inboxReader.init failure audits module=inbox_reader phase=init and rethrows', async () => {
    const clawDir = path.join(tmpdir(), `runtime-fail-test-${randomUUID()}`, 'claws', 'test');
    await fs.mkdir(clawDir, { recursive: true });

    const deps = await makeDeps(clawDir);
    const auditSpy = vi.spyOn(deps.auditWriter, 'write');

    // Mock inboxReader.init to throw
    const initError = new Error('ensureDir EACCES');
    vi.spyOn(deps.inboxReader, 'init').mockRejectedValue(initError);

    const runtime = new ClawRuntime({
      clawId: 'test-claw',
      clawDir,
      llmConfig: { primary: { name: 'mock', apiKey: 'k', model: 'm', maxTokens: 1, temperature: 0, timeoutMs: 1, apiFormat: 'anthropic' }, maxAttempts: 1, retryDelayMs: 0 },
      dependencies: deps as any,
    });

    await expect(runtime.initialize()).rejects.toThrow('ensureDir EACCES');

    const assembleFailedCall = auditSpy.mock.calls.find(c => c[0] === 'assemble_failed');
    expect(assembleFailedCall).toBeDefined();
    expect(assembleFailedCall![1]).toContain('module=inbox_reader');
    expect(assembleFailedCall![2]).toContain('phase=init');
    expect(assembleFailedCall![3]).toContain('EACCES');

    // Cleanup
    await fs.rm(path.dirname(path.dirname(clawDir)), { recursive: true, force: true }).catch(() => {});
  });
});
