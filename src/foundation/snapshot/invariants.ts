/**
 * snapshot SnapshotState persistState 入口 schema invariant。
 *
 * 应然 anchor（per design/modules/l<X>_snapshot.md §「persist-state observability」、phase 275 Step A）：
 * - DP1 信息不丢失：state.json 是降级控制状态、shape 漂 = 降级决策错乱
 * - DP2 不静默丢弃：违例 emit audit 消除静默
 * - DP3/DP5 状态可观察 + 凭日志记录重建：违例显式可观察
 *
 * 2 sub-check：
 * - consecutiveFailures: number + finite
 * - degradedAt: 缺省或 number + finite
 *
 * 与 `init()` load 端 inline schema check 对称：load 端违例 emit state_schema_invalid + clear state、
 * save 端本 Step 加对称 invariant emit（不 clear、保 acceptable degradation persist 路径）。
 *
 * 不 throw（DP1 + Path #4 防 break persistState silent fail 路径、acceptable degradation by design）。
 */

import type { AuditLog } from '../audit/index.js';
import { SNAPSHOT_AUDIT_EVENTS } from './audit-events.js';

export function assertSnapshotStateShape(state: unknown, audit: AuditLog): void {
  if (typeof state !== 'object' || state === null) {
    audit.write(
      SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
      `kind=state_not_object`, `actual=${typeof state}`,
    );
    return;
  }
  const s = state as Record<string, unknown>;

  checkConsecutiveFailures(s, audit);
  checkDegradedAt(s, audit);
}

function checkConsecutiveFailures(s: Record<string, unknown>, audit: AuditLog): void {
  if (typeof s.consecutiveFailures !== 'number' || !Number.isFinite(s.consecutiveFailures)) {
    audit.write(
      SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
      `kind=consecutiveFailures_invalid`, `actual=${String(s.consecutiveFailures)}`,
    );
  }
}

function checkDegradedAt(s: Record<string, unknown>, audit: AuditLog): void {
  if (s.degradedAt === undefined) return;   // optional
  if (typeof s.degradedAt !== 'number' || !Number.isFinite(s.degradedAt)) {
    audit.write(
      SNAPSHOT_AUDIT_EVENTS.STATE_INVARIANT_VIOLATED,
      `kind=degradedAt_invalid`, `actual=${String(s.degradedAt)}`,
    );
  }
}
