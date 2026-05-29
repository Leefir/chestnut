import { WAIT_FOR_DEFAULT_BUDGET_MS, WAIT_FOR_DEFAULT_POLL_MS } from './test-timeouts.js';

/**
 * Poll until condition returns true or timeout.
 * Supports both sync and async predicates.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = WAIT_FOR_DEFAULT_BUDGET_MS,
  intervalMs = WAIT_FOR_DEFAULT_POLL_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await condition()) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  const base = `waitFor timed out after ${timeoutMs}ms`;
  const msg = lastError instanceof Error
    ? `${base} (last predicate error: ${lastError.message})`
    : base;
  throw new Error(msg);
}
