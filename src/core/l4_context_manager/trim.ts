/**
 * @module L4.ContextManager
 * Context trim / pruning strategy
 *
 * Guarantees LLM API validity after trim:
 * - tool_use and tool_result must be paired (no orphans)
 * - turn boundary intact (do not cut inside a user turn)
 * - first user message must be preserved
 */

import type { Message } from '../../foundation/llm-provider/types.js';

export interface TrimOptions {
  target: number;                       // target token count (≤ budget.available)
  allowCacheBreak?: boolean;            // default false: keep cache anchor; true: deep trim at cost of cache hit
}

export interface TrimResult {
  messages: Message[];                  // trimmed messages (LLM API valid)
  droppedCount: number;
  cacheBroken: boolean;                 // whether cache anchor was actually broken
  estimatedTokensAfter: number;
}

export function trim(
  messages: Message[],
  systemPrompt: string,
  options: TrimOptions,
): TrimResult {
  // TBD: full trim algorithm to be implemented in Step C
  // For now return identity to keep module shell compilable
  void systemPrompt;
  void options;
  return {
    messages,
    droppedCount: 0,
    cacheBroken: false,
    estimatedTokensAfter: 0,
  };
}
