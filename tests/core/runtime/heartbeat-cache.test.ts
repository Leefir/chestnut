/**
 * Heartbeat cache fast path (phase 908 B1)
 *
 * Covers:
 * - cache hit: skips listSync when cached file still exists
 * - cache miss (first fire): listSync called + cache populated from scan
 * - cache miss (after consumption): falls through scan + writes new file
 */

import { describe, it, expect, vi } from 'vitest';
import { Heartbeat } from '../../../src/core/runtime/heartbeat.js';

function makeMockFs(opts: {
  existsSyncResult?: boolean;
  listSyncEntries?: Array<{ name: string }>;
} = {}) {
  const fileContents: Record<string, string> = {};
  if (opts.listSyncEntries) {
    for (const e of opts.listSyncEntries) {
      fileContents[`/base/motion/inbox/pending/${e.name}`] = '---\ntype: heartbeat\n---\nbody\n';
    }
  }
  return {
    ensureDirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(opts.existsSyncResult ?? false),
    listSync: vi.fn().mockReturnValue(opts.listSyncEntries ?? []),
    readSync: vi.fn((p: string) => fileContents[p] ?? '---\ntype: other\n---\n'),
    writeAtomicSync: vi.fn(),
  };
}

describe('Heartbeat cache fast path (B1)', () => {
  it('cache hit skips listSync when cached file still exists', () => {
    const fs = makeMockFs({ existsSyncResult: true });
    const audit = { write: vi.fn() };
    const heartbeat = new Heartbeat('/base', { fs: fs as any, audit: audit as any });
    (heartbeat as any).lastWrittenHeartbeatFile = 'existing.md';

    heartbeat.fire();

    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    expect(fs.existsSync).toHaveBeenCalledWith('/base/motion/inbox/pending/existing.md');
    expect(fs.listSync).not.toHaveBeenCalled();
    expect(fs.writeAtomicSync).not.toHaveBeenCalled();
  });

  it('cache miss on first fire: listSync called and syncs cache from scan', () => {
    const fs = makeMockFs({
      existsSyncResult: false,
      listSyncEntries: [{ name: 'hb_001.md' }],
    });
    const audit = { write: vi.fn() };
    const heartbeat = new Heartbeat('/base', { fs: fs as any, audit: audit as any });

    heartbeat.fire();

    // first fire: lastWrittenHeartbeatFile is undefined → existsSync not called (short-circuit)
    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.listSync).toHaveBeenCalledTimes(1);
    expect(fs.listSync).toHaveBeenCalledWith('/base/motion/inbox/pending');
    // cache populated from scan
    expect((heartbeat as any).lastWrittenHeartbeatFile).toBe('hb_001.md');
    expect(fs.writeAtomicSync).not.toHaveBeenCalled();
  });

  it('cache miss after consumption: falls through scan and writes new heartbeat', () => {
    const fs = makeMockFs({
      existsSyncResult: false,
      listSyncEntries: [],
    });
    const audit = { write: vi.fn() };
    const heartbeat = new Heartbeat('/base', { fs: fs as any, audit: audit as any });
    (heartbeat as any).lastWrittenHeartbeatFile = 'consumed.md';

    heartbeat.fire();

    expect(fs.existsSync).toHaveBeenCalledWith('/base/motion/inbox/pending/consumed.md');
    expect(fs.listSync).toHaveBeenCalledTimes(1);
    expect(fs.writeAtomicSync).toHaveBeenCalledTimes(1);
    // writeSync returns void → cache not updated after write
    expect((heartbeat as any).lastWrittenHeartbeatFile).toBe('consumed.md');
  });
});
