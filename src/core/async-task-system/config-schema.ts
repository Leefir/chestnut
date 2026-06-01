/**
 * AsyncTaskSystem retention config schema / phase 10 decentralize
 * Owner: async-task-system（tasks 保留窗口 yaml schema 业主）
 * Composed by: src/assembly/compose-config.ts (yaml `retention.tasks_max_days` field)
 */
import { z } from 'zod';

export const asyncTaskRetentionConfigSchema = z.object({
  tasks_max_days: z.number().int().positive().default(60),
});

export type AsyncTaskRetentionConfig = z.infer<typeof asyncTaskRetentionConfigSchema>;
