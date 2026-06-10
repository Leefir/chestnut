// src/core/evolution-system/state-cross-source-audit.ts

/**
 * evolution-system state.json processedContractIds ↔ 实然 contract archive 集合 cross-source audit。
 *
 * 应然 anchor（per design/modules/l4_evolution_system.md §「persist-state observability」、phase 253 Step B）：
 * - DP1 信息不丢失：state 内"已处理"标记与实然 contract archive 集合应同步、漂移 = 重复处理或永久遗漏
 * - DP5 凭日志记录重建：state 演进 + contract archive 实然应等价
 * - M#3 资源唯一：archive 列表归 L4 ContractSystem own（listArchiveContracts）、evolution 调
 *
 * EC-1: set(state.processedContractIds) ⊆ set(listArchiveContractIds())
 *
 * 不 throw（DP1 + Path #4 防 break _saveState 路径）。
 * provider 失败 → emit _skipped。
 */

import type { AuditLog } from '../../foundation/audit/index.js';
import { formatErr } from '../../foundation/utils/index.js';
import { RETRO_AUDIT_EVENTS } from './retro-audit-events.js';

interface EvolutionStateLike {
  processedContractIds: string[];
}

export async function auditEvolutionStateCrossSource(
  state: EvolutionStateLike,
  listArchiveContractIds: () => Promise<string[]>,
  audit: AuditLog,
): Promise<void> {
  let archives: Set<string>;
  try {
    archives = new Set(await listArchiveContractIds());
  } catch (err) {
    audit.write(
      RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_SKIPPED,
      `kind=ec1_skip`, `reason=list_archive_contracts_failed`,
      `error=${formatErr(err)}`,
    );
    return;
  }

  const orphan = state.processedContractIds.filter(id => !archives.has(id));
  if (orphan.length === 0) return;
  audit.write(
    RETRO_AUDIT_EVENTS.EVOLUTION_STATE_CROSS_SOURCE_MISMATCH,
    `kind=ec1_processedContractIds_orphan`,
    `orphan_ids=${orphan.slice(0, 5).join(',')}`,
    `orphan_count=${orphan.length}`,
    `archive_total=${archives.size}`,
  );
}
