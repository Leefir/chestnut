/**
 * snapshot SnapshotState 内部自洽 cross-source audit。
 *
 * 应然 anchor（per design/modules/l<X>_snapshot.md §「persist-state observability」、phase 275 Step B）：
 * - DP1 信息不丢失：state 内部字段语义不一致 = 降级决策错乱
 * - DP3 状态可观察：3 check 各显式 audit
 * - DP5 凭日志记录重建：state 演进契约抬到运行期
 * - M#3 资源唯一：snapshot 自治、scope 限内部自洽（无业务集合 cross-source）
 *
 * 3 check：
 * - SC-1: consecutiveFailures >= 0 非负整数
 * - SC-2: degradedAt set → consecutiveFailures > 0（degraded 状态语义一致性）
 * - SC-3: degradedAt <= now（timestamp 不在 future）
 *
 * 不 throw（DP1 + Path #4 防 break persistState silent fail 路径）。
 */

import type { AuditLog } from '../audit/index.js';
import { SNAPSHOT_AUDIT_EVENTS } from './audit-events.js';

interface SnapshotStateLike {
  consecutiveFailures: number;
  degradedAt?: number;
}

export function auditSnapshotStateCrossSource(
  state: SnapshotStateLike,
  audit: AuditLog,
  now: number,
): void {
  checkSC1(state, audit);
  checkSC2(state, audit);
  checkSC3(state, audit, now);
}

function checkSC1(s: SnapshotStateLike, audit: AuditLog): void {
  if (s.consecutiveFailures < 0 || !Number.isInteger(s.consecutiveFailures)) {
    audit.write(
      SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
      `kind=sc1_consecutiveFailures_invalid`,
      `actual=${s.consecutiveFailures}`,
    );
  }
}

function checkSC2(s: SnapshotStateLike, audit: AuditLog): void {
  if (s.degradedAt !== undefined && s.consecutiveFailures <= 0) {
    audit.write(
      SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
      `kind=sc2_degraded_without_failures`,
      `degradedAt=${s.degradedAt}`, `consecutiveFailures=${s.consecutiveFailures}`,
    );
  }
}

function checkSC3(s: SnapshotStateLike, audit: AuditLog, now: number): void {
  if (s.degradedAt !== undefined && s.degradedAt > now) {
    audit.write(
      SNAPSHOT_AUDIT_EVENTS.STATE_CROSS_SOURCE_MISMATCH,
      `kind=sc3_degradedAt_in_future`,
      `degradedAt=${s.degradedAt}`, `now=${now}`,
    );
  }
}
