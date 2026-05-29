/**
 * Test timeout constants for fixtures.
 *
 * - TEST_LLM_TIMEOUT_MS: LLM API timeout in test fixtures (30000ms / shorter than prod
 *   DEFAULT_LLM_TIMEOUT_MS = 60000 for faster test failure on real LLM hang).
 * - SUBAGENT_DEFAULT_TIMEOUT_MS: subagent scheduling timeout for long-running task tests
 *   (60000ms / coincidentally matches src DEFAULT_LLM_TIMEOUT_MS but semantic differs).
 * - SUBAGENT_SHORT_TIMEOUT_MS: subagent short timeout for race / lifecycle test fixtures
 *   (1000ms / used by async-task-system tests verifying timeout behavior).
 *
 * Why test-specific (not import src consts):
 * - TEST_LLM_TIMEOUT_MS differs from src DEFAULT_LLM_TIMEOUT_MS (60000) — intentional shorter.
 * - SUBAGENT_DEFAULT_TIMEOUT_MS semantic = subagent task lifecycle, not LLM API timeout.
 * - SUBAGENT_SHORT_TIMEOUT_MS pure test-fixture race scenario.
 */
export const TEST_LLM_TIMEOUT_MS = 30000;
export const SUBAGENT_DEFAULT_TIMEOUT_MS = 60000;
export const SUBAGENT_SHORT_TIMEOUT_MS = 1000;

/** Subagent waiting / polling timeout for medium-duration tests (5s = balance fast vs flake). */
export const SUBAGENT_WAIT_TIMEOUT_MS = 5000;

/** Subagent long-running test timeout (10s = longer-poll task verification). */
export const SUBAGENT_LONG_TIMEOUT_MS = 10000;

/**
 * Default budget for `waitFor` polling helper.
 * Value derive: typical local test predicate satisfied in <100ms; ×50 CI safety = 5000ms.
 * 同 SUBAGENT_WAIT_TIMEOUT_MS 数值，语义不同（前者是 subagent task lifecycle 超时、本常量是
 * test helper 默认轮询 budget），故不复用。
 */
export const WAIT_FOR_DEFAULT_BUDGET_MS = 5000;

/**
 * Default poll interval for `waitFor` helper.
 * Value derive: event-loop tick ~1-5ms 物理下界 / ×2 = 10ms granularity / 既不 busy-spin 也不漏窗.
 */
export const WAIT_FOR_DEFAULT_POLL_MS = 10;
