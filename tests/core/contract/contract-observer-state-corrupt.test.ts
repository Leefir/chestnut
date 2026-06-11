import { describe, it, expect, vi } from 'vitest';
import { runContractObserver } from '../../../src/core/contract/jobs/contract-observer.js';
import { CONTRACT_AUDIT_EVENTS } from '../../../src/core/contract/audit-events.js';
import type { FileSystem } from '../../../src/foundation/fs/types.js';
import type { AuditLog } from '../../../src/foundation/audit/index.js';
import type { ClawTopology } from '../../../src/core/claw-topology/types.js';
import * as path from 'path';

function makeFsMockWithState(stateContent: string): FileSystem {
  const files = new Map<string, string>();
  files.set('/tmp/test/motion/status/contract-observer-state.json', stateContent);

  const dirs = new Map<string, { name: string; isDirectory: boolean; size: number }[]>();
  dirs.set('/tmp/test/claws', []);

  return {
    existsSync: (p: string) => dirs.has(p) || files.has(p),
    listSync: (p: string) => dirs.get(p) ?? [],
    readSync: (p: string) => {
      if (files.has(p)) return files.get(p)!;
      throw new Error('ENOENT');
    },
    ensureDirSync: () => {},
    writeAtomicSync: () => {},
  } as unknown as FileSystem;
}

function makeMockTopology(fs: FileSystem, clawsDir: string): ClawTopology {
  return {
    enumerate() {
      const entries = fs.listSync(clawsDir, { includeDirs: true });
      return entries.filter(e => e.isDirectory).map(e => e.name);
    },
    resolve(clawId) {
      return { kind: 'local', clawDir: path.join(clawsDir, clawId) };
    },
    async read() { return ''; },
    async readJSON() { return {} as any; },
  };
}

function makeAuditMock(): { audit: AuditLog; events: Array<[string, ...(string | number)[]]> } {
  const events: Array<[string, ...(string | number)[]]> = [];
  const audit: AuditLog = {
    write: (type: string, ...cols: (string | number)[]) => {
      events.push([type, ...cols]);
    },
    preview: (s: string) => s,
    message: (s: string) => s,
    summary: (s: string) => s,
  };
  return { audit, events };
}

describe('contract observer state file shape_mismatch emits OBSERVER_STATE_PARSE_FAILED (phase 1012)', () => {
  it('lastCheckTs string → audit OBSERVER_STATE_PARSE_FAILED + fallback lastCheckTs=0', async () => {
    const fs = makeFsMockWithState(JSON.stringify({ lastCheckTs: 'abc' }));
    const { audit, events } = makeAuditMock();

    await runContractObserver({
      clawsDir: '/tmp/test/claws',
      clawTopology: makeMockTopology(fs, '/tmp/test/claws'),
      motionDir: '/tmp/test/motion',
      fs,
      motionAudit: audit,
      notifyMotion: vi.fn(),
    });

    const parseFailedEvents = events.filter(
      (e) => e[0] === CONTRACT_AUDIT_EVENTS.OBSERVER_STATE_PARSE_FAILED,
    );
    expect(parseFailedEvents.length).toBe(1);
    expect(parseFailedEvents[0]).toEqual(
      expect.arrayContaining([
        CONTRACT_AUDIT_EVENTS.OBSERVER_STATE_PARSE_FAILED,
        'reason=shape_mismatch',
        'stateFile=/tmp/test/motion/status/contract-observer-state.json',
      ]),
    );
  });

  it('empty object → audit OBSERVER_STATE_PARSE_FAILED + fallback lastCheckTs=0', async () => {
    const fs = makeFsMockWithState(JSON.stringify({}));
    const { audit, events } = makeAuditMock();

    await runContractObserver({
      clawsDir: '/tmp/test/claws',
      clawTopology: makeMockTopology(fs, '/tmp/test/claws'),
      motionDir: '/tmp/test/motion',
      fs,
      motionAudit: audit,
      notifyMotion: vi.fn(),
    });

    const parseFailedEvents = events.filter(
      (e) => e[0] === CONTRACT_AUDIT_EVENTS.OBSERVER_STATE_PARSE_FAILED,
    );
    expect(parseFailedEvents.length).toBe(1);
    expect(parseFailedEvents[0]).toEqual(
      expect.arrayContaining([
        CONTRACT_AUDIT_EVENTS.OBSERVER_STATE_PARSE_FAILED,
        'reason=shape_mismatch',
      ]),
    );
  });

  it('valid number lastCheckTs → no audit + uses value', async () => {
    const fs = makeFsMockWithState(JSON.stringify({ lastCheckTs: 12345 }));
    const { audit, events } = makeAuditMock();

    await runContractObserver({
      clawsDir: '/tmp/test/claws',
      clawTopology: makeMockTopology(fs, '/tmp/test/claws'),
      motionDir: '/tmp/test/motion',
      fs,
      motionAudit: audit,
      notifyMotion: vi.fn(),
    });

    const parseFailedEvents = events.filter(
      (e) => e[0] === CONTRACT_AUDIT_EVENTS.OBSERVER_STATE_PARSE_FAILED,
    );
    expect(parseFailedEvents.length).toBe(0);
  });
});
