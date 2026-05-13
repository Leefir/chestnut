/**
 * @module L4.SpawnSystem.Helpers
 * Module-level error format helper for spawn-system.
 *
 * phase 763：从 async-task-system/_helpers.ts 复制 formatErr 1 行 / 避免跨模块 deep import / Q3 决策。
 * 复杂化时立即 promote 到 foundation 共享。
 */

export function formatErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
