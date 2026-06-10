/**
 * turn_end 时对照 stream events 计数 与 dialog 该 turn 新增 block 计数。
 *
 * 应然 anchor（per design/modules/l5_runtime.md §「turn 生命周期完整性 cross-source audit」、phase 227）：
 * - DP5 凭日志记录完整重建：stream.jsonl + dialog/current.json 应等价、本审计把契约抬到运行期
 * - DP1 信息不丢失：本 turn 应 emit 的 block 数与实际 persist 的 block 数应一致
 * - DP3 状态可观察：不一致显式 audit
 *
 * 3 对照维度（互独立、各 emit 各的）：
 * 1. text_end stream events 数 ↔ 该 turn assistant message 内 text block 数
 * 2. tool_call stream events 数 ↔ 该 turn assistant message 内 tool_use block 数
 * 3. tool_result stream events 数 ↔ 该 turn user message 内 tool_result block 数
 *
 * 不 throw（DP1 防 break prod 路径）。
 */

import type { Message } from '../../foundation/llm-provider/types.js';
import type { AuditLog } from '../../foundation/audit/index.js';
import { RUNTIME_AUDIT_EVENTS } from './runtime-audit-events.js';

export interface TurnStreamCounts {
  textEnd: number;
  toolCall: number;
  toolResult: number;
}

export function auditTurnCompleteness(
  streamCounts: TurnStreamCounts,
  turnSlice: ReadonlyArray<Message>,
  audit: AuditLog,
  traceId: string | undefined,
): void {
  const dialogCounts = countBlocks(turnSlice);

  if (dialogCounts.text !== streamCounts.textEnd) {
    audit.write(
      RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH,
      `kind=text_block_count`,
      `stream_text_end=${streamCounts.textEnd}`,
      `dialog_text_block=${dialogCounts.text}`,
      `trace_id=${traceId ?? 'unknown'}`,
      `turn_slice_length=${turnSlice.length}`,
    );
  }

  if (dialogCounts.toolUse !== streamCounts.toolCall) {
    audit.write(
      RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH,
      `kind=tool_use_count`,
      `stream_tool_call=${streamCounts.toolCall}`,
      `dialog_tool_use=${dialogCounts.toolUse}`,
      `trace_id=${traceId ?? 'unknown'}`,
      `turn_slice_length=${turnSlice.length}`,
    );
  }

  if (dialogCounts.toolResult !== streamCounts.toolResult) {
    audit.write(
      RUNTIME_AUDIT_EVENTS.TURN_COMPLETENESS_MISMATCH,
      `kind=tool_result_count`,
      `stream_tool_result=${streamCounts.toolResult}`,
      `dialog_tool_result=${dialogCounts.toolResult}`,
      `trace_id=${traceId ?? 'unknown'}`,
      `turn_slice_length=${turnSlice.length}`,
    );
  }
}

function countBlocks(messages: ReadonlyArray<Message>): {
  text: number;
  toolUse: number;
  toolResult: number;
} {
  let text = 0, toolUse = 0, toolResult = 0;
  for (const m of messages) {
    const content = m.content;
    if (typeof content === 'string') {
      // string content 算 1 text block（assistant 路径）
      if (m.role === 'assistant') text++;
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const t = (block as { type?: string }).type;
      if (t === 'text' && m.role === 'assistant') text++;
      else if (t === 'tool_use') toolUse++;
      else if (t === 'tool_result') toolResult++;
    }
  }
  return { text, toolUse, toolResult };
}
