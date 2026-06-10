/**
 * @phase 229 invariant test
 * Forward-defending: poller disable 后 recovery 路径 reinit 成功 + count reset + 2 audit events emit
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/daemon/inbox-watcher.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/daemon/inbox-watcher.js')>();
  return {
    ...actual,
    waitForInbox: vi.fn().mockResolvedValue(undefined),
  };
});

import { startDaemonLoop } from '../../src/daemon/daemon-loop.js';
import { DAEMON_AUDIT_EVENTS } from '../../src/daemon/audit-events.js';
import {
  INTERRUPT_POLL_INTERVAL_MS,
  INTERRUPT_POLL_MAX_ERRORS,
  INTERRUPT_POLL_RECOVERY_BACKOFF_MS,
} from '../../src/daemon/constants.js';

describe('interrupt-poller-recovery invariant (phase 229)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createHarness() {
    const audit = { write: vi.fn(), preview: vi.fn((s: string) => s), message: vi.fn((s: string) => s), summary: vi.fn((s: string) => s) };
    let resolveProcessBatch: ((v: number) => void) | undefined;
    let rejectProcessBatch: ((e: unknown) => void) | undefined;

    const runtime = {
      processBatch: vi.fn().mockImplementation(() => new Promise<number>((resolve, reject) => {
        resolveProcessBatch = resolve;
        rejectProcessBatch = reject;
      })),
      retryLastTurn: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };

    const mockFs = {
      deleteSync: vi.fn(),
      ensureDirSync: vi.fn(),
      writeAtomicSync: vi.fn(),
      readSync: vi.fn(),
      existsSync: vi.fn().mockReturnValue(false),
      listSync: vi.fn().mockReturnValue([]),
      resolve: vi.fn((p: string) => p),
    };

    const fsFactory = vi.fn().mockReturnValue(mockFs);

    const { promise, stop } = startDaemonLoop({
      runtime: runtime as unknown as Parameters<typeof startDaemonLoop>[0]['runtime'],
      agentDir: '/tmp/test-agent',
      clawId: 'test-claw',
      label: '[test]',
      audit: audit as unknown as Parameters<typeof startDaemonLoop>[0]['audit'],
      inbox: { pendingDir: '/tmp/test-agent/inbox/pending', fallbackTimeoutMs: 100_000 },
      fsFactory,
    });

    return {
      promise,
      stop,
      audit,
      runtime,
      mockFs,
      fsFactory,
      resolveProcessBatch,
      rejectProcessBatch,
    };
  }

  async function teardown(harness: ReturnType<typeof createHarness>) {
    harness.stop();
    harness.resolveProcessBatch?.(0);
    // advance past waitForInbox fallback timeout so the loop can drain and exit
    await vi.advanceTimersByTimeAsync(100_000 + 10);
    await harness.promise;
  }

  // --------------------------------------------------------------------------
  // 反向 1
  // --------------------------------------------------------------------------

  it('反向 1：poller disable → backoff → reinit → audit emit recovery', async () => {
    const h = createHarness();
    h.mockFs.deleteSync.mockImplementation(() => {
      throw Object.assign(new Error('EIO'), { code: 'EIO' });
    });

    // let loop reach await processBatch (poller is already created)
    await vi.advanceTimersByTimeAsync(0);

    // advance to trigger MAX_ERRORS disable
    await vi.advanceTimersByTimeAsync(INTERRUPT_POLL_INTERVAL_MS * INTERRUPT_POLL_MAX_ERRORS);

    const disabledAudits = h.audit.write.mock.calls.filter(
      (c) => c[0] === DAEMON_AUDIT_EVENTS.LOOP_INTERRUPT_POLLER_DISABLED,
    );
    expect(disabledAudits).toHaveLength(1);
    expect(disabledAudits[0][1]).toBe(`error_count=${INTERRUPT_POLL_MAX_ERRORS}`);
    expect(disabledAudits[0][2]).toContain('last_error=');

    // advance past recovery backoff
    await vi.advanceTimersByTimeAsync(INTERRUPT_POLL_RECOVERY_BACKOFF_MS);

    const recoveryAttemptAudits = h.audit.write.mock.calls.filter(
      (c) => c[0] === DAEMON_AUDIT_EVENTS.LOOP_INTERRUPT_POLLER_RECOVERY_ATTEMPT,
    );
    expect(recoveryAttemptAudits).toHaveLength(1);
    expect(recoveryAttemptAudits[0][1]).toBe(`backoff_ms=${INTERRUPT_POLL_RECOVERY_BACKOFF_MS}`);

    const recoveredAudits = h.audit.write.mock.calls.filter(
      (c) => c[0] === DAEMON_AUDIT_EVENTS.LOOP_INTERRUPT_POLLER_RECOVERED,
    );
    expect(recoveredAudits).toHaveLength(1);

    await teardown(h);
  });

  // --------------------------------------------------------------------------
  // 反向 2
  // --------------------------------------------------------------------------

  it('反向 2：recovery 后 user ctrl-C → poller reinit → runtime.abort 正常 trigger', async () => {
    const h = createHarness();

    // First trigger MAX_ERRORS to disable poller
    h.mockFs.deleteSync.mockImplementation(() => {
      throw Object.assign(new Error('EIO'), { code: 'EIO' });
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERRUPT_POLL_INTERVAL_MS * INTERRUPT_POLL_MAX_ERRORS);

    // advance past recovery backoff
    await vi.advanceTimersByTimeAsync(INTERRUPT_POLL_RECOVERY_BACKOFF_MS);

    // Now simulate interrupt file present (deleteSync succeeds)
    h.mockFs.deleteSync.mockImplementation(() => {
      return undefined;
    });

    // Next poller tick should trigger abort
    await vi.advanceTimersByTimeAsync(INTERRUPT_POLL_INTERVAL_MS);
    expect(h.runtime.abort).toHaveBeenCalledTimes(1);

    await teardown(h);
  });
});
