/**
 * Messaging retention config schema / phase 10 decentralize
 * Owner: messaging（inbox + outbox 保留窗口 yaml schema 业主）
 * Composed by: src/assembly/compose-config.ts (yaml `retention.{inbox,outbox}_max_days` field)
 *
 * Note: retention.* 是跨模块字段集（inbox + outbox + tasks + dialog）、各 owner 各 own 自家字段、composer 合到 root.retention
 */
import { z } from 'zod';

export const messagingRetentionConfigSchema = z.object({
  inbox_max_days: z.number().int().positive().default(30),
  outbox_max_days: z.number().int().positive().default(30),
});

export type MessagingRetentionConfig = z.infer<typeof messagingRetentionConfigSchema>;
