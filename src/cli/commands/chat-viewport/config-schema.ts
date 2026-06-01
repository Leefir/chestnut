/**
 * Chat-viewport config schema / phase 10 decentralize
 * Owner: cli/chat-viewport（用户视图渲染开关 yaml schema 业主）
 * Composed by: src/assembly/compose-config.ts (yaml `viewport.*` field)
 */
import { z } from 'zod';

export const viewportConfigSchema = z.object({
  show_recap_stream: z.boolean().default(false),
  show_system_messages: z.boolean().default(false),
  show_contract_events: z.boolean().default(true),
  trim_output_newlines: z.boolean().default(true),
});

export type ViewportConfig = z.infer<typeof viewportConfigSchema>;
