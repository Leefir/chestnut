import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { auditQueryCommand, collectColFilter } from '../../src/cli/commands/audit-query.js';
import { NodeFileSystem } from '../../src/foundation/fs/node-fs.js';
import type { FileSystem } from '../../src/foundation/fs/types.js';

const fsFactory = (dir: string) => new NodeFileSystem({ baseDir: dir });

vi.mock('../../src/foundation/config/index.js', () => ({
  loadGlobalConfig: vi.fn(),
  clawExists: vi.fn((deps: any, p: string) => {
    // Mock: claw exists if path includes 'test-claw'
    return p.includes('test-claw');
  }),
  getClawDir: vi.fn((claw: string) => `/tmp/chestnut-test/claws/${claw}`),
  getClawConfigPath: vi.fn((claw: string) => `/tmp/chestnut-test/claws/${claw}/config.yaml`),
}));

describe('audit query', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    tempDir = require('fs').mkdtempSync('/tmp/chestnut-test-');
    require('fs').mkdirSync(path.join(tempDir, 'claws', 'test-claw'), { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      require('fs').rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  function writeAudit(claw: string, content: string, fileName = 'audit.tsv') {
    const dir = path.join(tempDir, 'claws', claw);
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').writeFileSync(path.join(dir, fileName), content);
  }

  it('claw not found → throws CliError', async () => {
    await expect(auditQueryCommand(
      { fsFactory },
      { claw: 'nonexistent', file: 'audit' },
    )).rejects.toThrow('Claw "nonexistent" does not exist');
  });

  it('basic read yields all rows as TSV', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\ta\tcol1\n2024-01-01T00:00:01Z\tseq=2\tb\tcol2\n');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit' });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('');
    expect(lines).toContain('seq=1');
    expect(lines).toContain('seq=2');
  });

  it('--json yields JSON lines', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\ta\tcol1\n');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit', json: true });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.seq).toBe(1);
    expect(parsed.source).toBe('audit');
  });

  it('--type filter', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\tcron_tick\n2024-01-01T00:00:01Z\tseq=2\tother\n');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit', type: 'cron_*' });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('cron_tick');
  });

  it('--from-seq filter', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\ta\n2024-01-01T00:00:01Z\tseq=3\tb\n');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit', fromSeq: 3 });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('seq=3');
  });

  it('--trace filter', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\ta\tcol1\ttrace_id=abc\n2024-01-01T00:00:01Z\tseq=2\tb\tcol1\ttrace_id=def\n');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit', trace: 'abc' });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('trace_id=abc');
  });

  it('--limit filter', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\ta\n2024-01-01T00:00:01Z\tseq=2\tb\n2024-01-01T00:00:02Z\tseq=3\tc\n');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit', limit: 2 });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('--all-files yields from multiple files', async () => {
    writeAudit('test-claw', '2024-01-01T00:00:00Z\tseq=1\ta\n', 'audit.tsv');
    writeAudit('test-claw', '2024-01-01T00:00:01Z\tseq=1\ttick_event\n', 'tick.tsv');
    const { getClawDir } = await import('../../src/foundation/config/index.js');
    vi.mocked(getClawDir).mockReturnValue(path.join(tempDir, 'claws', 'test-claw'));

    await auditQueryCommand({ fsFactory }, { claw: 'test-claw', file: 'audit', allFiles: true });

    const lines = stdoutSpy.mock.calls.map(c => c[0] as string).join('').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('--file and --all-files mutually exclusive → throws', async () => {
    await expect(auditQueryCommand(
      { fsFactory },
      { claw: 'test-claw', file: 'tick', allFiles: true },
    )).rejects.toThrow('--file and --all-files are mutually exclusive');
  });

  it('--follow and --all-files mutually exclusive → throws', async () => {
    await expect(auditQueryCommand(
      { fsFactory },
      { claw: 'test-claw', file: 'audit', allFiles: true, follow: true },
    )).rejects.toThrow('--follow is incompatible with --all-files');
  });

  it('collectColFilter parses key=val', () => {
    expect(collectColFilter('k=v')).toEqual({ k: 'v' });
    expect(collectColFilter('k=v2', { k: 'v1' })).toEqual({ k: 'v2' });
  });

  it('collectColFilter throws on missing =', () => {
    expect(() => collectColFilter('bad')).toThrow('--col value must be key=val format');
  });

  it('collectColFilter handles = in value', () => {
    expect(collectColFilter('cmd=foo=bar')).toEqual({ cmd: 'foo=bar' });
  });
});
