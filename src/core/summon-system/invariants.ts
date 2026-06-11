// src/core/summon-system/invariants.ts

/**
 * summon-state SummonDecision 读写入口 schema invariant。
 *
 * 应然 anchor（per design/modules/l4_summon_system.md §「persist-state observability」、phase 255 Step A）：
 * - DP1 信息不丢失：SummonDecision 是 summon 调度的权威决策、shape 漂 = decision 与执行错位
 * - DP2 不静默丢弃：违例 emit audit 消除静默
 * - DP3/DP5 状态可观察 + 凭日志记录重建：违例显式可观察
 *
 * 本模块 read 端原本是 `JSON.parse(content) as SummonDecision` raw cast 无 shape 守、
 * 是 cluster 内独此一份的 read 端缺口（cluster 前 4 phase: contract/async-task/memory/evolution
 * load 端都有 shape check + corrupt isolate / backup 路径）。本 Step 同治 read + write 双端。
 *
 * direction 字段区分 read / write 路径、audit 消费者 filter 用。
 *
 * 不 throw（DP1 + Path #4 防 break 既有 IO 错 throw 路径 / fallback 返 undefined 路径）。
 */

import type { AuditLog } from '../../foundation/audit/index.js';
import { SUMMON_AUDIT_EVENTS } from './audit-events.js';

export type SummonInvariantDirection = 'write' | 'read';

const SUMMON_STATE_CURRENT_VERSION = 1;
const VALID_MODES: ReadonlySet<string> = new Set(['shadow', 'mining']);
const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function assertSummonDecisionShape(
  decision: unknown,
  audit: AuditLog | undefined,
  direction: SummonInvariantDirection,
): void {
  if (!audit) return;   // audit?: AuditLog 是 store factory 既有 optional 契约（write/read 都接 optional audit）

  if (typeof decision !== 'object' || decision === null) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=decision_not_object`, `direction=${direction}`, `actual=${typeof decision}`,
    );
    return;
  }
  const d = decision as Record<string, unknown>;
  const taskIdForLog = typeof d.taskId === 'string' ? d.taskId : 'unknown';

  checkSchemaVersion(d, audit, direction);
  checkTaskId(d, audit, direction);
  checkVerify(d, audit, direction, taskIdForLog);
  checkTargetClaw(d, audit, direction, taskIdForLog);
  checkMode(d, audit, direction, taskIdForLog);
  checkDispatchedAt(d, audit, direction, taskIdForLog);
}

function checkSchemaVersion(d: Record<string, unknown>, audit: AuditLog, direction: SummonInvariantDirection): void {
  if (d.schema_version === undefined) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_LEGACY_V0_MIGRATED,
      `kind=legacy_v0_detected`, `direction=${direction}`,
    );
    return;
  }
  if (typeof d.schema_version !== 'number') {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=schema_version_not_number`, `direction=${direction}`, `actual=${typeof d.schema_version}`,
    );
    return;
  }
  if (d.schema_version !== SUMMON_STATE_CURRENT_VERSION) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=schema_version_mismatch`, `direction=${direction}`, `actual=${d.schema_version}`, `expected=${SUMMON_STATE_CURRENT_VERSION}`,
    );
  }
}

function checkTaskId(d: Record<string, unknown>, audit: AuditLog, direction: SummonInvariantDirection): void {
  if (typeof d.taskId !== 'string') {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=taskId_not_string`, `direction=${direction}`, `actual=${typeof d.taskId}`,
    );
  } else if (d.taskId.length === 0) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=taskId_empty`, `direction=${direction}`,
    );
  }
}

function checkVerify(d: Record<string, unknown>, audit: AuditLog, direction: SummonInvariantDirection, taskId: string): void {
  if (typeof d.verify !== 'boolean') {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=verify_not_boolean`, `direction=${direction}`, `taskId=${taskId}`,
      `actual=${typeof d.verify}`,
    );
  }
}

function checkTargetClaw(d: Record<string, unknown>, audit: AuditLog, direction: SummonInvariantDirection, taskId: string): void {
  if (d.targetClaw === undefined) return;   // optional
  if (typeof d.targetClaw !== 'string') {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=targetClaw_not_string`, `direction=${direction}`, `taskId=${taskId}`,
      `actual=${typeof d.targetClaw}`,
    );
  }
}

function checkMode(d: Record<string, unknown>, audit: AuditLog, direction: SummonInvariantDirection, taskId: string): void {
  if (typeof d.mode !== 'string' || !VALID_MODES.has(d.mode)) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=mode_not_in_union`, `direction=${direction}`, `taskId=${taskId}`,
      `actual=${String(d.mode)}`,
    );
  }
}

function checkDispatchedAt(d: Record<string, unknown>, audit: AuditLog, direction: SummonInvariantDirection, taskId: string): void {
  if (typeof d.dispatchedAt !== 'string') {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=dispatchedAt_not_string`, `direction=${direction}`, `taskId=${taskId}`,
      `actual=${typeof d.dispatchedAt}`,
    );
    return;
  }
  if (!ISO_TIMESTAMP_REGEX.test(d.dispatchedAt)) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_INVARIANT_VIOLATED,
      `kind=dispatchedAt_not_iso`, `direction=${direction}`, `taskId=${taskId}`,
      `actual=${d.dispatchedAt}`,
    );
  }
}
