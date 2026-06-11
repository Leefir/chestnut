/**
 * subagent steps.jsonl entry shape 入口 schema invariant。
 *
 * 应然 anchor（per design/modules/l3_subagent.md §「persist-state observability」、phase 270 Step A）：
 * - DP1 信息不丢失：steps.jsonl 是 subagent step 进展权威记录、shape 漂 = forensic 解析失败
 * - DP2 不静默丢弃：违例 emit audit 消除静默
 * - DP3/DP5 状态可观察 + 凭日志记录重建：违例显式可观察
 *
 * 4 sub-check（entry shape `{step: number, ts: ISO timestamp, tools: string[], elapsedMs: number}`）：
 * - step: number (非负整数)
 * - ts: string + ISO 8601 timestamp 形态
 * - tools: string[] (元素 string)
 * - elapsedMs: number (非负整数)
 *
 * 不 throw（DP1 + Path #4 防 break subagent run 路径 + 保既有 STEP_COMPLETE_FAILED 路径）。
 */

import type { AuditLog } from '../../foundation/audit/index.js';
import { SUBAGENT_AUDIT_EVENTS } from './audit-events.js';

const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function assertStepsEntryShape(
  entry: unknown,
  audit: AuditLog,
  agentId: string,
): void {
  if (typeof entry !== 'object' || entry === null) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=entry_not_object`, `agentId=${agentId}`, `actual=${typeof entry}`,
    );
    return;
  }
  const e = entry as Record<string, unknown>;
  checkStep(e, audit, agentId);
  checkTs(e, audit, agentId);
  checkTools(e, audit, agentId);
  checkElapsedMs(e, audit, agentId);
}

function checkStep(e: Record<string, unknown>, audit: AuditLog, agentId: string): void {
  if (typeof e.step !== 'number' || !Number.isInteger(e.step) || e.step < 0) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=step_invalid`, `agentId=${agentId}`, `actual=${String(e.step)}`,
    );
  }
}

function checkTs(e: Record<string, unknown>, audit: AuditLog, agentId: string): void {
  if (typeof e.ts !== 'string') {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=ts_not_string`, `agentId=${agentId}`, `actual=${typeof e.ts}`,
    );
    return;
  }
  if (!ISO_TIMESTAMP_REGEX.test(e.ts)) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=ts_not_iso`, `agentId=${agentId}`, `actual=${e.ts}`,
    );
  }
}

function checkTools(e: Record<string, unknown>, audit: AuditLog, agentId: string): void {
  if (!Array.isArray(e.tools)) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=tools_not_array`, `agentId=${agentId}`, `actual=${typeof e.tools}`,
    );
    return;
  }
  const nonStrIdx = e.tools.findIndex(x => typeof x !== 'string');
  if (nonStrIdx >= 0) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=tools_element_not_string`, `agentId=${agentId}`,
      `idx=${nonStrIdx}`, `actual=${typeof e.tools[nonStrIdx]}`,
    );
  }
}

function checkElapsedMs(e: Record<string, unknown>, audit: AuditLog, agentId: string): void {
  if (typeof e.elapsedMs !== 'number' || !Number.isInteger(e.elapsedMs) || e.elapsedMs < 0) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_STEPS_INVARIANT_VIOLATED,
      `kind=elapsedMs_invalid`, `agentId=${agentId}`, `actual=${String(e.elapsedMs)}`,
    );
  }
}
