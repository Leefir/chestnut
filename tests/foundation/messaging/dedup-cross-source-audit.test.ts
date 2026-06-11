/**
 * Messaging dedup cross-source audit tests (phase 273 Step B)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { InboxWriter, makeInboxPath, OutboxWriter, makeOutboxPath } from '../../../src/foundation/messaging/index.js';
import { NodeFileSystem } from '../../../src/foundation/fs/node-fs.js';
import { auditInboxDedup, auditOutboxDedup } from '../../../src/foundation/messaging/dedup-cross-source-audit.js';
import { MESSAGING_AUDIT_EVENTS } from '../../../src/foundation/messaging/audit-events.js';
import { INBOX_PENDING_DIR } from '../../../src/foundation/messaging/dirs.js';
import type { InboxMessage } from '../../../src/foundation/messaging/types.js';

describe('messaging dedup cross-source audit (phase 273 Step B)', () => {
  let auditCalls: string[];
  let audit: { write(type: string, ...cols: (string | number)[]): void };

  beforeEach(() => {
    auditCalls = [];
    audit = {
      write(type: string, ...cols: (string | number)[]) {
        auditCalls.push(`${type}:${cols.join(',')}`);
      },
    };
  });

  // ─── CC-1: inbox prefix unique ───────────────────────────────────────────

  describe('CC-1: inbox prefix unique', () => {
    let testDir: string;
    let nfs: NodeFileSystem;

    beforeEach(async () => {
      testDir = path.join(tmpdir(), `cc1-test-${randomUUID()}`);
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(testDir, { recursive: true });
      nfs = new NodeFileSystem({ baseDir: testDir });
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('unique prefix → 0 emit', async () => {
      await fs.writeFile(path.join(testDir, 'sender-123456789012345_high_abc123.md'), 'x', 'utf-8');
      await auditInboxDedup('sender-123456789012345_high_def456.md', testDir, nfs, audit);
      const mismatch = auditCalls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(0);
    });

    it('2 files same prefix → emit cc1_inbox_prefix_collision', async () => {
      await fs.writeFile(path.join(testDir, 'sender-123456789012345_high_abc123.md'), 'x', 'utf-8');
      await fs.writeFile(path.join(testDir, 'sender-123456789012345_normal_def456.md'), 'y', 'utf-8');
      await auditInboxDedup('sender-123456789012345_high_abc123.md', testDir, nfs, audit);
      const mismatch = auditCalls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0]).toContain('kind=cc1_inbox_prefix_collision');
      expect(mismatch[0]).toContain('collision_count=2');
    });

    it('filename not matching format → 0 emit (silent skip, leave to future filename invariant)', async () => {
      await auditInboxDedup('invalid_filename.md', testDir, nfs, audit);
      expect(auditCalls).toHaveLength(0);
    });
  });

  // ─── CC-2: outbox prefix unique ──────────────────────────────────────────

  describe('CC-2: outbox prefix unique', () => {
    let testDir: string;
    let nfs: NodeFileSystem;

    beforeEach(async () => {
      testDir = path.join(tmpdir(), `cc2-test-${randomUUID()}`);
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(testDir, { recursive: true });
      nfs = new NodeFileSystem({ baseDir: testDir });
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('unique → 0 emit', async () => {
      await fs.writeFile(path.join(testDir, '1234567890123_report_abc123.md'), 'x', 'utf-8');
      await auditOutboxDedup('1234567890123_report_def456.md', testDir, nfs, audit);
      const mismatch = auditCalls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(0);
    });

    it('collision → emit cc2', async () => {
      await fs.writeFile(path.join(testDir, '1234567890123_report_abc123.md'), 'x', 'utf-8');
      await fs.writeFile(path.join(testDir, '1234567890123_report_def456.md'), 'y', 'utf-8');
      await auditOutboxDedup('1234567890123_report_abc123.md', testDir, nfs, audit);
      const mismatch = auditCalls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0]).toContain('kind=cc2_outbox_prefix_collision');
      expect(mismatch[0]).toContain('collision_count=2');
    });
  });

  // ─── fs.list 失败降级 ────────────────────────────────────────────────────

  describe('fs.list failure fallback', () => {
    it('inbox fs.list throw → emit cc1_skip', async () => {
      const badFs = {
        async list() { throw new Error('disk error'); },
      } as unknown as NodeFileSystem;
      await auditInboxDedup('sender-123456789012345_high_abc.md', '/any', badFs, audit);
      const skipped = auditCalls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_SKIPPED));
      expect(skipped).toHaveLength(1);
      expect(skipped[0]).toContain('kind=cc1_skip');
    });

    it('outbox fs.list throw → emit cc2_skip', async () => {
      const badFs = {
        async list() { throw new Error('disk error'); },
      } as unknown as NodeFileSystem;
      await auditOutboxDedup('123_report_abc.md', '/any', badFs, audit);
      const skipped = auditCalls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_SKIPPED));
      expect(skipped).toHaveLength(1);
      expect(skipped[0]).toContain('kind=cc2_skip');
    });
  });

  // ─── 集成 ────────────────────────────────────────────────────────────────

  describe('integration', () => {
    let testDir: string;
    let nfs: NodeFileSystem;
    let calls: string[];
    let a: { write(type: string, ...cols: (string | number)[]): void };

    beforeEach(async () => {
      testDir = path.join(tmpdir(), `dedup-integ-${randomUUID()}`);
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(testDir, { recursive: true });
      nfs = new NodeFileSystem({ baseDir: testDir });
      calls = [];
      a = {
        write(type: string, ...cols: (string | number)[]) {
          calls.push(`${type}:${cols.join(',')}`);
        },
      };
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('normal inbox.write 1 time → 0 mismatch emit', async () => {
      const writer = InboxWriter.__internal_create(nfs, makeInboxPath(INBOX_PENDING_DIR), a);
      const msg: InboxMessage = {
        id: 'test-1', type: 'message', from: 'sender', to: 'claw',
        content: 'Hello', priority: 'normal', timestamp: new Date().toISOString(),
      };
      await writer.write(msg);
      // Give fire-and-forget a tick to complete
      await new Promise(r => setTimeout(r, 50));
      const mismatch = calls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(0);
    });

    it('normal inbox.writeSync 1 time → 0 mismatch emit', async () => {
      const writer = InboxWriter.__internal_create(nfs, makeInboxPath(INBOX_PENDING_DIR), a);
      writer.writeSync({ type: 'ping', source: 'motion', priority: 'normal', body: 'test' });
      await new Promise(r => setTimeout(r, 50));
      const mismatch = calls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(0);
    });

    it('normal outbox.write 1 time → 0 mismatch emit', async () => {
      const writer = OutboxWriter.__internal_create('claw-a', makeOutboxPath('claw-a', testDir), nfs, a);
      await writer.write({ type: 'report', to: 'claw-b', content: 'Hello' });
      await new Promise(r => setTimeout(r, 50));
      const mismatch = calls.filter(c => c.startsWith(MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH));
      expect(mismatch).toHaveLength(0);
    });

    it('fire-and-forget audit throw → write main path not blocked', async () => {
      const badFs = new NodeFileSystem({ baseDir: testDir });
      // Override list to throw after write succeeds
      let listCallCount = 0;
      badFs.list = async function list(_path: string, _opts?: unknown) {
        listCallCount++;
        throw new Error('list fail');
      } as unknown as typeof badFs.list;
      const writer = InboxWriter.__internal_create(badFs, makeInboxPath(INBOX_PENDING_DIR), a);
      const msg: InboxMessage = {
        id: 'test-1', type: 'message', from: 'sender', to: 'claw',
        content: 'Hello', priority: 'normal', timestamp: new Date().toISOString(),
      };
      await writer.write(msg);
      const files = await fs.readdir(path.join(testDir, 'inbox', 'pending'));
      expect(files).toHaveLength(1);
      expect(listCallCount).toBeGreaterThanOrEqual(1);
    });
  });
});
