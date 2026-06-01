/**
 * DialogStore retention config schema / phase 10 decentralize
 * Owner: dialog-store（dialog snapshot 保留窗口 yaml schema 业主）
 * Composed by: src/assembly/compose-config.ts (yaml `retention.dialog_max_days` field)
 */
import { z } from 'zod';

export const dialogRetentionConfigSchema = z.object({
  dialog_max_days: z.number().int().positive().default(90),
});

export type DialogRetentionConfig = z.infer<typeof dialogRetentionConfigSchema>;
