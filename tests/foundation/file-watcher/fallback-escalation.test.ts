import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWatcher, FALLBACK_CONSECUTIVE_FAIL_LIMIT } from '../../../src/foundation/file-watcher/index.js';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { waitFor } from '../../helpers/wait-for.js';

const FAST_POLL_MS = 10;
// Expected time to reach escalation = FAST_POLL_MS × FALLBACK_CONSECUTIVE_FAIL_LIMIT (50ms).
// Wall-clock safety factor for CI load (×100) — same shape as other src→test derivation
// patterns (mirror Tier 1 magic-treatment-kit src cluster #4 derive-from-export pattern).
const WALL_CLOCK_SAFETY_FACTOR = 100;
const ESCALATION_WAIT_BUDGET_MS = FAST_POLL_MS * FALLBACK_CONSECUTIVE_FAIL_LIMIT * WALL_CLOCK_SAFETY_FACTOR;
const RESET_OBSERVATION_POLL_COUNT = 10;
const POST_RESET_WAIT_BUDGET_MS = FAST_POLL_MS * RESET_OBSERVATION_POLL_COUNT * WALL_CLOCK_SAFETY_FACTOR;

describe('fallback poller escalation (macOS only)', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fallback-test-'));
    testFile = path.join(tmpDir, 'test.txt');
    writeFileSync(testFile, '');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // skipIf rationale: chokidar fallback poller is only enabled on macOS FSEvents path
  // when stability === 'immediate' (per src/foundation/file-watcher/watcher.ts comment).
  // Linux inotify + Windows ReadDirectoryChangesW do not use the fallback poller,
  // so escalation cannot be exercised on those platforms by design — not a coverage gap.
  it.skipIf(process.platform !== 'darwin')(
    'disables poller after 5 consecutive callback failures',
    async () => {
      const errors: Array<{ err: Error; context: string }> = [];
      const callback = vi.fn(() => {
        throw new Error('forced callback failure');
      });

      const watcher = createWatcher(testFile, callback, {
        stability: 'immediate',
        fallbackPollMs: FAST_POLL_MS,
        onError: (err, context) => {
          errors.push({ err, context });
        },
      });

      // Wait for fallback_limit_reset context (replaces fixed setTimeout(100)).
      await waitFor(
        () => errors.some(e => e.context === 'fallback_limit_reset'),
        ESCALATION_WAIT_BUDGET_MS,
        FAST_POLL_MS,
      );

      // Assert escalation
      const fallbackLimitReset = errors.find(e => e.context === 'fallback_limit_reset');
      expect(fallbackLimitReset, 'expected fallback_limit_reset context').toBeDefined();
      expect(fallbackLimitReset!.err.message).toMatch(/callback failure limit reached/);

      // phase 1082: poller is NOT permanently disabled — it resets counter and continues.
      // Verify callbacks keep accumulating after the limit is reached.
      const countAtLimit = callback.mock.calls.length;
      await waitFor(() => callback.mock.calls.length > countAtLimit, ESCALATION_WAIT_BUDGET_MS);
      expect(callback.mock.calls.length).toBeGreaterThan(countAtLimit);

      // Stop watcher (clearInterval again is no-op-safe)
      await watcher.close();
    },
  );

  // (Same darwin-only rationale as above)
  it.skipIf(process.platform !== 'darwin')(
    'resets counter on successful callback',
    async () => {
      let throwCount = 0;
      const errors: Array<{ err: Error; context: string }> = [];
      const callback = vi.fn(() => {
        throwCount++;
        if (throwCount <= 3) throw new Error('intermittent fail');
        // success after 3 fails
      });

      const watcher = createWatcher(testFile, callback, {
        stability: 'immediate',
        fallbackPollMs: FAST_POLL_MS,
        onError: (err, context) => {
          errors.push({ err, context });
        },
      });

      // Wait until ≥RESET_OBSERVATION_POLL_COUNT polls have run (3 fails + ≥7 successes — counter must reset).
      await waitFor(
        () => callback.mock.calls.length >= RESET_OBSERVATION_POLL_COUNT,
        POST_RESET_WAIT_BUDGET_MS,
        FAST_POLL_MS,
      );
      await watcher.close();

      const fallbackLimitReset = errors.find(e => e.context === 'fallback_limit_reset');
      expect(fallbackLimitReset).toBeUndefined(); // no escalation
    },
  );
});
