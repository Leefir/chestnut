/** Truncation threshold for combined exec output (β 应用层 / 应然 §10.4 ~2000) */
export const EXEC_MAX_OUTPUT = 2000;

/** CommandTool overflow scratch 子目录名（phase 1475 提取常量、消 split.pop()! non-null assertion） */
export const EXEC_OVERFLOW_DIR_NAME = 'exec';

/** CommandTool own sync scratch subdir（turn-scoped / Snapshot whitelist 清理）*/
export const TASKS_SYNC_EXEC_DIR = `tasks/sync/${EXEC_OVERFLOW_DIR_NAME}`;
