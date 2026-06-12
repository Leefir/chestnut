/**
 * Phase 310 — watchdog-state legacy version fallback path must emit audit.
 *
 * V10 真治：读 pre-phase-1134 disk file（无 schema_version、有 version）触发 legacy fallback 时，
 * 必须 emit `STATE_LEGACY_VERSION_FALLBACK`，补 DP1/2/3/5 + 编码规范「审计事件是行为契约一部分」。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// Mock config so getChestnutDir() returns controllable values
vi.mock('../../src/foundation/config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/foundation/config/index.js')>();
  return {
    ...actual,
    getNamedSubrootDir: vi.fn(),
    loadGlobalConfig: vi.fn(),
  };
});
vi.mock('../../src/assembly/config-load.js', async () => {
  const foundation = await import('../../src/foundation/config/index.js');
  return {
    loadGlobalConfig: foundation.loadGlobalConfig,
    isInitialized: vi.fn(),
    saveGlobalConfig: vi.fn(),
    loadClawConfig: vi.fn(),
    patchGlobalConfigPrimary: vi.fn(),
    saveClawConfig: vi.fn(),
    clawExists: vi.fn(() => true),
    buildLLMConfig: vi.fn(),
  };
});

import { getNamedSubrootDir } from '../../src/foundation/config/index.js';
import { loadGlobalConfig } from '../../src/assembly/config-load.js';
import { loadWatchdogState } from '../../src/watchdog/watchdog-state.js';
import { clawStateAPI, setAuditWriter, _resetWatchdogContextForTest } from '../../src/watchdog/watchdog-context.js';
import { WATCHDOG_AUDIT_EVENTS } from '../../src/watchdog/audit-events.js';
import { NodeFileSystem } from '../../src/foundation/fs/node-fs.js';
import type { AuditLog } from '../../src/foundation/audit/index.js';

const fsFactory = (dir: string) => new NodeFileSystem({ baseDir: dir });

describe('watchdog-state legacy version fallback audit emit — phase 310', () => {
  let tmpDir: string;
  let chestnutDir: string;

  beforeEach(() => {
    _resetWatchdogContextForTest();
    tmpDir = path.join(os.tmpdir(), `wd-legacy-fallback-${randomUUID()}`);
    chestnutDir = path.join(tmpDir, '.chestnut');
    fs.mkdirSync(chestnutDir, { recursive: true });
    vi.mocked(getNamedSubrootDir).mockReturnValue(path.join(chestnutDir, 'motion'));
    vi.mocked(loadGlobalConfig).mockReturnValue({ watchdog: { claw_inactivity_timeout_ms: 300_000 } } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits STATE_LEGACY_VERSION_FALLBACK when disk has legacy version field', () => {
    const stateFile = path.join(chestnutDir, 'watchdog-state.json');
    fs.writeFileSync(stateFile, JSON.stringify({
      version: 1,
      lastInactivityNotified: { claw1: 100 },
      inactivityNotifyCount: { claw1: 2 },
      clawPreviouslyAlive: { claw1: true },
      everSpawned: ['claw1'],
    }));

    const mockAudit = { write: vi.fn(), preview: vi.fn((s: string) => s), message: vi.fn((s: string) => s), summary: vi.fn((s: string) => s) } as unknown as AuditLog;
    setAuditWriter(mockAudit);

    loadWatchdogState(fsFactory);

    // Maps loaded successfully from legacy file
    expect(clawStateAPI.lastInactivityNotified.get('claw1')).toBe(100);
    expect(clawStateAPI.inactivityNotifyCount.get('claw1')).toBe(2);
    expect(clawStateAPI.clawPreviouslyAlive.get('claw1')).toBe(true);
    expect(clawStateAPI.everSpawned.has('claw1')).toBe(true);

    // Must emit legacy fallback audit event
    const auditCalls = mockAudit.write.mock.calls;
    const fallbackCall = auditCalls.find((c: any[]) => c[0] === WATCHDOG_AUDIT_EVENTS.STATE_LEGACY_VERSION_FALLBACK);
    expect(fallbackCall).toBeDefined();
    expect(fallbackCall).toEqual(
      expect.arrayContaining([
        WATCHDOG_AUDIT_EVENTS.STATE_LEGACY_VERSION_FALLBACK,
        expect.stringContaining('legacy_version=1'),
      ]),
    );
  });

  it('does NOT emit STATE_LEGACY_VERSION_FALLBACK when disk has schema_version (new format)', () => {
    const stateFile = path.join(chestnutDir, 'watchdog-state.json');
    fs.writeFileSync(stateFile, JSON.stringify({
      schema_version: 2,
      lastInactivityNotified: { claw1: 200 },
      inactivityNotifyCount: { claw1: 3 },
      clawPreviouslyAlive: { claw1: false },
      everSpawned: ['claw1'],
    }));

    const mockAudit = { write: vi.fn(), preview: vi.fn((s: string) => s), message: vi.fn((s: string) => s), summary: vi.fn((s: string) => s) } as unknown as AuditLog;
    setAuditWriter(mockAudit);

    loadWatchdogState(fsFactory);

    // Maps loaded successfully from new-format file
    expect(clawStateAPI.lastInactivityNotified.get('claw1')).toBe(200);
    expect(clawStateAPI.inactivityNotifyCount.get('claw1')).toBe(3);
    expect(clawStateAPI.clawPreviouslyAlive.get('claw1')).toBe(false);
    expect(clawStateAPI.everSpawned.has('claw1')).toBe(true);

    // Must NOT emit legacy fallback audit event
    const auditCalls = mockAudit.write.mock.calls;
    const fallbackCall = auditCalls.find((c: any[]) => c[0] === WATCHDOG_AUDIT_EVENTS.STATE_LEGACY_VERSION_FALLBACK);
    expect(fallbackCall).toBeUndefined();
  });
});
