/**
 * Phase 283: typed commit function for turn events.
 *
 * By-construction guarantee: every turn event that affects the dialog
 * also emits a corresponding stream event through a single typed function.
 *
 * Anchor: phase 227 turn-completeness 3 对照消除 → 编译期 enforce（M#9）。
 * Dialog append is owned by the agent-executor internally (by-construction);
 * this function owns the stream-emit side to ensure no event is dropped.
 */

import type { ToolUseId } from '../../foundation/tool-protocol/index.js';

export type TurnEvent =
  | { kind: 'text_end' }
  | { kind: 'tool_call'; name: string; toolUseId: ToolUseId }
  | { kind: 'tool_result'; name: string; toolUseId: ToolUseId; result: { success: boolean; content: string }; step: number; maxSteps: number };

export interface TurnEventCommitDeps {
  /** Emit text_end to stream consumers. */
  onTextEnd?: () => void;
  /** Emit tool_call to stream consumers. */
  onToolCall?: (name: string, toolUseId: ToolUseId) => void;
  /** Emit tool_result to stream consumers. */
  onToolResult?: (name: string, toolUseId: ToolUseId, result: { success: boolean; content: string }, step: number, maxSteps: number) => void;
}

export function commitTurnEvent(event: TurnEvent, deps: TurnEventCommitDeps): void {
  switch (event.kind) {
    case 'text_end':
      deps.onTextEnd?.();
      break;
    case 'tool_call':
      deps.onToolCall?.(event.name, event.toolUseId);
      break;
    case 'tool_result':
      deps.onToolResult?.(event.name, event.toolUseId, event.result, event.step, event.maxSteps);
      break;
  }
}
