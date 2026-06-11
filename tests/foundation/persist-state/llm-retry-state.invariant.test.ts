import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fsNative from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startDaemonLoop } from '../../../src/daemon/daemon-loop.js';
import { NodeFileSystem } from '../../../src/foundation/fs/node-fs.js';
import type { Runtime } from '../../../src/core/runtime/index.js';
import type { AuditLog } from '../../../src/foundation/audit/index.js';

const fsFactory = (dir: string) => new NodeFileSystem({ baseDir: dir });

function makeTempAgentDir() {
  const tmpDir = fsNative.mkdtempSync(path.join(os.tmpdir(), 'llm-retry-inv-'));
  return tmpDir;
}

function cleanup(dir: string) {
  try {
    fsNative.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore cleanup failure */ }
}

/** Flush the microtask queue n times to let async code advance */
async function flushMicrotasks(n = 6) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function makeMockAudit() {
  return {
    write: vi.fn(),
    preview: vi.fn((s: string) => s),
    message: vi.fn((s: string) => s),
    summary: vi.fn((s: string) => s),
  };
}

describe('llm-retry state load invariants', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('ENOENT silently uses defaults (first start)', async () => {
    vi.useFakeTimers();
    const agentDir = makeTempAgentDir();
    const mockAudit = makeMockAudit();
    const processBatch = vi.fn().mockResolvedValue(0);
    const mockRuntime = { processBatch, retryLastTurn: vi.fn(), abort: vi.fn() } as unknown as Runtime;

    const { stop } = startDaemonLoop({
      fsFactory,
      runtime: mockRuntime,
      agentDir,
      clawId: 'llm-retry-enonet-test',
      label: '[llm-retry-enonet-test]',
      audit: mockAudit as unknown as AuditLog,
      inbox: { pendingDir: path.join(agentDir, 'inbox/pending'), fallbackTimeoutMs: 1_000 },
    });

    await flushMicrotasks();

    // No LLM_RETRY_STATE_LOAD_FAILED should be emitted for ENOENT (first start)
    const loadFailedCalls = mockAudit.write.mock.calls.filter(
      (c: unknown[]) => c[0] === 'daemon_llm_retry_state_load_failed',
    );
    expect(loadFailedCalls).toHaveLength(0);

    stop();
    vi.advanceTimersByTime(1_001);
    await flushMicrotasks();
    cleanup(agentDir);
  });

  it('read_failed emits audit with reason=read_failed', async () => {
    vi.useFakeTimers();
    const agentDir = makeTempAgentDir();
    fsNative.mkdirSync(path.join(agentDir, 'status'), { recursive: true });
    fsNative.writeFileSync(path.join(agentDir, 'status', 'llm-retry-state.json'), 'any');
    // Make file unreadable (chmod 000) to trigger read failure on non-Windows
    if (process.platform !== 'win32') {
      fsNative.chmodSync(path.join(agentDir, 'status', 'llm-retry-state.json'), 0o000);
    }

    const mockAudit = makeMockAudit();
    const processBatch = vi.fn().mockResolvedValue(0);
    const mockRuntime = { processBatch, retryLastTurn: vi.fn(), abort: vi.fn() } as unknown as Runtime;

    const { stop } = startDaemonLoop({
      fsFactory,
      runtime: mockRuntime,
      agentDir,
      clawId: 'llm-retry-read-test',
      label: '[llm-retry-read-test]',
      audit: mockAudit as unknown as AuditLog,
      inbox: { pendingDir: path.join(agentDir, 'inbox/pending'), fallbackTimeoutMs: 1_000 },
    });

    await flushMicrotasks();

    if (process.platform !== 'win32') {
      const loadFailedCalls = mockAudit.write.mock.calls.filter(
        (c: unknown[]) => c[0] === 'daemon_llm_retry_state_load_failed',
      );
      expect(loadFailedCalls.length).toBeGreaterThanOrEqual(1);
      expect(loadFailedCalls.some((c: unknown[]) =>
        (c[1] as string)?.includes('reason=read_failed'),
      )).toBe(true);
    }

    stop();
    vi.advanceTimersByTime(1_001);
    await flushMicrotasks();
    if (process.platform !== 'win32') {
      fsNative.chmodSync(path.join(agentDir, 'status', 'llm-retry-state.json'), 0o644);
    }
    cleanup(agentDir);
  });

  it('parse_failed emits audit with reason=parse_failed', async () => {
    vi.useFakeTimers();
    const agentDir = makeTempAgentDir();
    fsNative.mkdirSync(path.join(agentDir, 'status'), { recursive: true });
    fsNative.writeFileSync(path.join(agentDir, 'status', 'llm-retry-state.json'), 'not-json{');

    const mockAudit = makeMockAudit();
    const processBatch = vi.fn().mockResolvedValue(0);
    const mockRuntime = { processBatch, retryLastTurn: vi.fn(), abort: vi.fn() } as unknown as Runtime;

    const { stop } = startDaemonLoop({
      fsFactory,
      runtime: mockRuntime,
      agentDir,
      clawId: 'llm-retry-parse-test',
      label: '[llm-retry-parse-test]',
      audit: mockAudit as unknown as AuditLog,
      inbox: { pendingDir: path.join(agentDir, 'inbox/pending'), fallbackTimeoutMs: 1_000 },
    });

    await flushMicrotasks();

    const loadFailedCalls = mockAudit.write.mock.calls.filter(
      (c: unknown[]) => c[0] === 'daemon_llm_retry_state_load_failed',
    );
    expect(loadFailedCalls.length).toBeGreaterThanOrEqual(1);
    expect(loadFailedCalls.some((c: unknown[]) =>
      (c[1] as string)?.includes('reason=parse_failed'),
    )).toBe(true);

    stop();
    vi.advanceTimersByTime(1_001);
    await flushMicrotasks();
    cleanup(agentDir);
  });

  it('schema_version_mismatch emits audit', async () => {
    vi.useFakeTimers();
    const agentDir = makeTempAgentDir();
    fsNative.mkdirSync(path.join(agentDir, 'status'), { recursive: true });
    fsNative.writeFileSync(
      path.join(agentDir, 'status', 'llm-retry-state.json'),
      JSON.stringify({ schema_version: 2, llmRetryCount: 1, llmRetryDelayMs: 1000, llmRetryPending: false }),
    );

    const mockAudit = makeMockAudit();
    const processBatch = vi.fn().mockResolvedValue(0);
    const mockRuntime = { processBatch, retryLastTurn: vi.fn(), abort: vi.fn() } as unknown as Runtime;

    const { stop } = startDaemonLoop({
      fsFactory,
      runtime: mockRuntime,
      agentDir,
      clawId: 'llm-retry-version-test',
      label: '[llm-retry-version-test]',
      audit: mockAudit as unknown as AuditLog,
      inbox: { pendingDir: path.join(agentDir, 'inbox/pending'), fallbackTimeoutMs: 1_000 },
    });

    await flushMicrotasks();

    const loadFailedCalls = mockAudit.write.mock.calls.filter(
      (c: unknown[]) => c[0] === 'daemon_llm_retry_state_load_failed',
    );
    expect(loadFailedCalls.length).toBeGreaterThanOrEqual(1);
    expect(loadFailedCalls.some((c: unknown[]) =>
      (c[1] as string)?.includes('reason=schema_version_mismatch'),
    )).toBe(true);

    stop();
    vi.advanceTimersByTime(1_001);
    await flushMicrotasks();
    cleanup(agentDir);
  });

  it('field_type_mismatch emits audit', async () => {
    vi.useFakeTimers();
    const agentDir = makeTempAgentDir();
    fsNative.mkdirSync(path.join(agentDir, 'status'), { recursive: true });
    fsNative.writeFileSync(
      path.join(agentDir, 'status', 'llm-retry-state.json'),
      JSON.stringify({ schema_version: 1, llmRetryCount: 'invalid', llmRetryDelayMs: 1000, llmRetryPending: false }),
    );

    const mockAudit = makeMockAudit();
    const processBatch = vi.fn().mockResolvedValue(0);
    const mockRuntime = { processBatch, retryLastTurn: vi.fn(), abort: vi.fn() } as unknown as Runtime;

    const { stop } = startDaemonLoop({
      fsFactory,
      runtime: mockRuntime,
      agentDir,
      clawId: 'llm-retry-field-test',
      label: '[llm-retry-field-test]',
      audit: mockAudit as unknown as AuditLog,
      inbox: { pendingDir: path.join(agentDir, 'inbox/pending'), fallbackTimeoutMs: 1_000 },
    });

    await flushMicrotasks();

    const loadFailedCalls = mockAudit.write.mock.calls.filter(
      (c: unknown[]) => c[0] === 'daemon_llm_retry_state_load_failed',
    );
    expect(loadFailedCalls.length).toBeGreaterThanOrEqual(1);
    expect(loadFailedCalls.some((c: unknown[]) =>
      (c[1] as string)?.includes('reason=field_type_mismatch'),
    )).toBe(true);

    stop();
    vi.advanceTimersByTime(1_001);
    await flushMicrotasks();
    cleanup(agentDir);
  });

  it('valid schema_version=1 + valid fields applies state', async () => {
    vi.useFakeTimers();
    const agentDir = makeTempAgentDir();
    fsNative.mkdirSync(path.join(agentDir, 'status'), { recursive: true });
    fsNative.writeFileSync(
      path.join(agentDir, 'status', 'llm-retry-state.json'),
      JSON.stringify({ schema_version: 1, llmRetryCount: 5, llmRetryDelayMs: 2000, llmRetryPending: true }),
    );

    const mockAudit = makeMockAudit();
    const processBatch = vi.fn().mockResolvedValue(0);
    const mockRuntime = { processBatch, retryLastTurn: vi.fn(), abort: vi.fn() } as unknown as Runtime;

    const { stop } = startDaemonLoop({
      fsFactory,
      runtime: mockRuntime,
      agentDir,
      clawId: 'llm-retry-valid-test',
      label: '[llm-retry-valid-test]',
      audit: mockAudit as unknown as AuditLog,
      inbox: { pendingDir: path.join(agentDir, 'inbox/pending'), fallbackTimeoutMs: 1_000 },
    });

    await flushMicrotasks();

    const loadFailedCalls = mockAudit.write.mock.calls.filter(
      (c: unknown[]) => c[0] === 'daemon_llm_retry_state_load_failed',
    );
    expect(loadFailedCalls).toHaveLength(0);

    // State applied: on next LLM failure, retry should start with count=5, delay=2000
    stop();
    vi.advanceTimersByTime(1_001);
    await flushMicrotasks();
    cleanup(agentDir);
  });
});
