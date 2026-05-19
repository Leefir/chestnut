import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchedAuditWriter } from '../../../src/foundation/audit/batched-writer.js';
import type { FileSystem } from '../../../src/foundation/fs/types.js';

function makeMockFs(): { fs: FileSystem; writes: string[] } {
  const writes: string[] = [];
  return {
    fs: {
      appendSync: vi.fn((_path: string, content: string) => { writes.push(content); }),
      statSync: vi.fn(() => ({ size: 0, mtimeMs: 0 })),
      moveSync: vi.fn(),
      existsSync: vi.fn(() => false),
      listSync: vi.fn(() => []),
      readSync: vi.fn(() => ''),
      writeAtomicSync: vi.fn(),
      ensureDirSync: vi.fn(),
      deleteSync: vi.fn(),
    } as unknown as FileSystem,
    writes,
  };
}

describe('BatchedAuditWriter', () => {
  let writer: BatchedAuditWriter;

  afterEach(() => {
    writer?.dispose();
  });

  it('反向 1: buffer accumulates, flush on threshold (batchSize=3)', () => {
    const { fs, writes } = makeMockFs();
    writer = new BatchedAuditWriter(fs, '/tmp/test.tsv', { batchSize: 3, flushIntervalMs: 60_000 });

    writer.write('event_a', 'k=v');
    writer.write('event_b', 'k=v');
    // 2 writes — not yet flushed
    expect(writes.length).toBe(0);

    writer.write('event_c', 'k=v');
    // 3rd write — flush triggered
    expect(writes.length).toBe(1);
    const flushed = writes[0];
    expect(flushed.split('\n').filter(Boolean).length).toBe(3);
    expect(flushed).toContain('event_a');
    expect(flushed).toContain('event_b');
    expect(flushed).toContain('event_c');
  });

  it('反向 2: dispose() flushes remaining buffer', () => {
    const { fs, writes } = makeMockFs();
    writer = new BatchedAuditWriter(fs, '/tmp/test.tsv', { batchSize: 100, flushIntervalMs: 60_000 });

    writer.write('event_x', 'k=v');
    writer.write('event_y', 'k=v');
    expect(writes.length).toBe(0);

    writer.dispose();
    expect(writes.length).toBe(1);
    expect(writes[0]).toContain('event_x');
    expect(writes[0]).toContain('event_y');
  });

  it('反向 3: rotation on maxBytes exceeded', () => {
    const { fs, writes } = makeMockFs();
    (fs.statSync as any).mockReturnValue({ size: 10 * 1024 * 1024 }); // 10MB
    writer = new BatchedAuditWriter(fs, '/tmp/test.tsv', { maxSizeMb: 5, batchSize: 1 });

    writer.write('event_z', 'k=v');
    expect(fs.moveSync).toHaveBeenCalled();
    expect(writes.length).toBe(1);
  });
});
