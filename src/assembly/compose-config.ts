/**
 * Phase 10 Step B: root config composer (decentralize 落地点)
 *
 * 拼 14 owner module 各自 configSchema 成 root global + claw schema。
 * 不持任何字段含义（业务归各 owner）、不持 ConfigDefaults interface（defaults 内联各 owner）。
 *
 * Refs: coding plan/phase10/Phase 10 总览.md + Step A.md + Step B.md
 */
import { z } from 'zod';
import { llmOrchestratorConfigSchema } from '../foundation/llm-orchestrator/config-schema.js';
import { runtimeMotionConfigSchema } from '../core/runtime/config-schema.js';
import { toolsConfigSchema } from '../foundation/tools/config-schema.js';
import { watchdogConfigSchema } from '../watchdog/config-schema.js';
import { cronConfigSchema } from '../core/cron/config-schema.js';
import { viewportConfigSchema } from '../cli/commands/chat-viewport/config-schema.js';
import { auditConfigSchema } from '../foundation/audit/config-schema.js';
import { streamConfigSchema } from '../foundation/stream/config-schema.js';
import { messagingRetentionConfigSchema } from '../foundation/messaging/config-schema.js';
import { asyncTaskRetentionConfigSchema } from '../core/async-task-system/config-schema.js';
import { dialogRetentionConfigSchema } from '../foundation/dialog-store/config-schema.js';
import { agentExecutorConfigSchema } from '../core/agent-executor/config-schema.js';
import { clawConfigSchema } from '../core/runtime/claw-config-schema.js';

export function createGlobalConfigSchema() {
  return z.object({
    version: z.string().default('1'),
    default_max_steps: agentExecutorConfigSchema,
    llm: llmOrchestratorConfigSchema,
    motion: runtimeMotionConfigSchema.optional(),
    tool_timeout_ms: toolsConfigSchema,
    watchdog: watchdogConfigSchema.optional(),
    cron: cronConfigSchema.optional(),
    viewport: viewportConfigSchema.optional(),
    audit: auditConfigSchema.optional(),
    stream: streamConfigSchema.optional(),
    retention: z.object({
      ...messagingRetentionConfigSchema.shape,
      ...asyncTaskRetentionConfigSchema.shape,
      ...dialogRetentionConfigSchema.shape,
    }).optional(),
    // Future cross-field validation hook (currently 0 cross-field constraint):
    //   .refine((cfg) => <constraint>, { message: '...' })
  });
}

export function getClawConfigSchema() {
  return clawConfigSchema;
}

export type ClawGlobalConfig = z.infer<ReturnType<typeof createGlobalConfigSchema>>;
export type ClawConfig = z.infer<typeof clawConfigSchema>;
