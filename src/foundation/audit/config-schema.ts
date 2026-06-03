/**
 * Audit config schema / phase 10 decentralize
 * Owner: audit-log（audit.tsv retention yaml schema 业主）
 * Composed by: src/assembly/compose-config.ts (yaml `audit.retention.*` field)
 */
import { z } from 'zod';

export const auditConfigSchema = z.object({
  retention: z.object({
    max_size_mb: z.number().min(1).nullable().default(null),
  }).default({}),
});

export type AuditConfig = z.infer<typeof auditConfigSchema>;
