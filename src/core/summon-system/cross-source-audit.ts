// src/core/summon-system/cross-source-audit.ts

/**
 * summon-state SummonDecision ↔ async-task taskId universe cross-source audit。
 *
 * 应然 anchor（per design/modules/l4_summon_system.md §「persist-state observability」、phase 255 Step B）：
 * - DP1 信息不丢失：summon decision 与 async-task 执行应同步、漂移 = decision 与执行错位
 * - DP5 凭日志记录重建：summon 调 ↔ stateStore.write ↔ async-task schedule 三源应等价
 * - M#3 资源唯一：taskId 集合归 async-task own、summon 调；本模块不 import async-task、provider 经装配期注入
 *
 * SC-1: SummonDecision.taskId ∈ asyncTaskUniverse（write 入口逐 decision 检）
 * SC-2: summon-state/ 目录内 taskId 集合 ⊆ asyncTaskUniverse（按需扫描、helper 立、调用点 follow-up）
 *
 * 不 throw（DP1 + Path #4 防 break write 路径）。
 * provider 失败 → emit _skipped。
 */

import type { AuditLog } from '../../foundation/audit/index.js';
import { formatErr } from '../../foundation/utils/index.js';
import { SUMMON_AUDIT_EVENTS } from './audit-events.js';

export type AsyncTaskUniverseProvider = () => Promise<ReadonlySet<string>>;

interface SummonDecisionLike {
  taskId: string;
}

export async function auditSummonDecisionCrossSource(
  decision: SummonDecisionLike,
  provider: AsyncTaskUniverseProvider,
  audit: AuditLog,
): Promise<void> {
  let universe: ReadonlySet<string>;
  try {
    universe = await provider();
  } catch (err) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_CROSS_SOURCE_SKIPPED,
      `kind=sc1_skip`, `taskId=${decision.taskId}`,
      `reason=async_task_universe_failed`,
      `error=${formatErr(err)}`,
    );
    return;
  }

  if (!universe.has(decision.taskId)) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_CROSS_SOURCE_MISMATCH,
      `kind=sc1_orphan_taskId`, `taskId=${decision.taskId}`,
      `universe_size=${universe.size}`,
    );
  }
}

/**
 * SC-2: 扫描 summon-state/ 目录内 taskId 集合、检测 orphan 文件（不在 async-task universe）。
 *
 * 调用时机留 follow-up（独立 phase 决定 boot reconcile / 周期 tick）：
 * - boot 时调一次（systemic 漂检）
 * - 周期 tick（防 long-running drift）
 * - summon 收尾（每次 summon 完成后扫一次本 taskId 相关）
 *
 * 本 helper 立 + 不在 write 入口频繁调（避 每 write fs.list 性能开销）。
 */
export async function auditSummonStateOrphan(
  stateDirTaskIds: ReadonlySet<string>,
  provider: AsyncTaskUniverseProvider,
  audit: AuditLog,
): Promise<void> {
  let universe: ReadonlySet<string>;
  try {
    universe = await provider();
  } catch (err) {
    audit.write(
      SUMMON_AUDIT_EVENTS.SUMMON_STATE_CROSS_SOURCE_SKIPPED,
      `kind=sc2_skip`, `reason=async_task_universe_failed`,
      `error=${formatErr(err)}`,
    );
    return;
  }

  const orphan = [...stateDirTaskIds].filter(id => !universe.has(id));
  if (orphan.length === 0) return;
  audit.write(
    SUMMON_AUDIT_EVENTS.SUMMON_STATE_CROSS_SOURCE_MISMATCH,
    `kind=sc2_orphan_summon_state`,
    `orphan_ids=${orphan.slice(0, 5).join(',')}`,
    `orphan_count=${orphan.length}`,
    `universe_size=${universe.size}`,
  );
}
