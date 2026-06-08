/**
 * @module Assembly.GuidanceComposers
 * phase 63 γ NEW: contract_crashed real composer
 * phase 191: 删 null 旁路、扩 batch 路径（observer 投 extraFields.crashes）
 *
 * 触发：markCrashed 走 safeNotify 路径（motion 自家 contract 执行 5 typed Error 之一）
 *      或 contract-observer cron 扫 worker archive 发现 crashed contract
 *
 * 设计原则（Philosophy「系统为智能体服务、提供基础设施和必要信息」）：
 * - 事实 + 系统已尝试 + 相关基础设施
 * - 0 prescription
 * - motion 自决 cancel + re-summon / 调研 backup / 询问 user / 调整 fork 策略
 */

import type { GuidanceComposer, GuidanceEntry } from '../types.js';

interface ContractCrashedState {
  source_claw?: string;
  contract_id?: string;
  cause?: string;
  crashes?: string; // JSON-encoded array (observer 路径)
}

interface CrashEntry {
  source_claw: string;
  contract_id: string;
  cause: string;
}

const CAUSE_FORMAT_NOTE = [
  `cause 字面格式: "system: <typed_error_class_name>"（如 system: maxstepsexceedederror）`,
  `  - 表示 agent loop / LLM provider 物理推不动该 contract`,
  `  - 非 user 主动决策、非 daemon crash（daemon 仍活着）`,
];

const SYSTEM_DID = [
  `  - Runtime catch 捕获 typed Error（max_steps / wall_time / parse_loop / max_tokens / llm_all_providers）`,
  `  - 从 inbox message metadata 取 contract_id`,
  `  - ContractSystem.markCrashed: lockContract + saveProgress(status='crashed') + abortContractVerifiers + move source → archive`,
  `  - emit CONTRACT_CRASHED audit`,
];

const INFRASTRUCTURE = [
  `  CLI:        chestnut contract [list|cancel|create]`,
  `  agent 工具: exec, ask_user, send, summon, notify_claw`,
  `  文件系统:   archive 下的 contract 目录可 read/inspect、含 progress.json (含 cause 在 checkpoint) + contract.yaml`,
];

const MAX_BATCH_RENDER = 10;

export const composer: GuidanceComposer<ContractCrashedState> = (state): GuidanceEntry => {
  const entries = parseEntries(state);
  if (entries.length === 0) {
    // 既无 single entry 又无 batch、仍出 guidance（旁路删后底线：至少投 system已做 + 基础设施 hint）
    return { text: renderBatch([{ source_claw: '(unknown)', contract_id: '(unknown)', cause: '(unknown)' }]) };
  }
  return { text: renderBatch(entries) };
};

function parseEntries(state: ContractCrashedState): CrashEntry[] {
  // batch 路径优先
  if (state.crashes) {
    try {
      const parsed = JSON.parse(state.crashes) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((e): e is CrashEntry =>
            typeof e === 'object' && e !== null &&
            typeof (e as Record<string, unknown>).source_claw === 'string' &&
            typeof (e as Record<string, unknown>).contract_id === 'string' &&
            typeof (e as Record<string, unknown>).cause === 'string'
          );
      }
    } catch {
      // silent: JSON parse failure handled by fallback to single-entry path below
    }
  }
  // single entry 路径（safeNotify）
  if (state.contract_id) {
    return [{
      source_claw: state.source_claw ?? '(unknown)',
      contract_id: state.contract_id,
      cause: state.cause ?? '(no cause given)',
    }];
  }
  return [];
}

function renderBatch(entries: CrashEntry[]): string {
  const lines: string[] = [`[contract_crashed]`, ``];
  const displayCount = Math.min(entries.length, MAX_BATCH_RENDER);
  if (entries.length > MAX_BATCH_RENDER) {
    lines.push(`(${entries.length} crashes、显示前 ${MAX_BATCH_RENDER})`, ``);
  }
  lines.push(`事实:`);
  for (const e of entries.slice(0, displayCount)) {
    lines.push(`  - source_claw: ${e.source_claw}`);
    lines.push(`    contract_id: ${e.contract_id}`);
    lines.push(`    cause:       ${e.cause}`);
  }
  lines.push(``, ...CAUSE_FORMAT_NOTE);
  lines.push(``, `系统已做（per crash）:`);
  lines.push(...SYSTEM_DID);
  lines.push(``, `相关基础设施:`);
  lines.push(...INFRASTRUCTURE);
  return lines.join('\n');
}
