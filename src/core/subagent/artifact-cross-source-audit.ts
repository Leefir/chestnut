/**
 * subagent run 收尾 multi-artifact 完整性 cross-source audit。
 *
 * 应然 anchor（per design/modules/l3_subagent.md §「persist-state observability」、phase 270 Step B）：
 * - DP1 信息不丢失：subagent 5 类 artifact 应同步、漂移 = forensic 不可重建
 * - DP3 状态可观察：6 check 各显式 audit
 * - DP5 凭日志记录重建：5 源契约抬到运行期
 * - 与 phase 227 runtime turn-completeness 同型契约在 subagent 内重演（M#3 各模块自治、不复用代码）
 *
 * 6 check：
 * - AC-1: audit TURN_END 数 === stream TURN_END 数（同期写、应等价）→ 用 counter
 *   注：counter 与 callback 内 emit 1:1 对应、by-construction 等价、本 phase 不额外 emit
 * - AC-2: audit TURN_START 数 === audit TURN_END 数（pair 对齐）→ 用 counter
 * - AC-3: steps.jsonl 行数 === auditStepCount（loop step）→ counter vs fs.read line count
 * - AC-4: messageStore 末轮 assistant ↔ textEndCount > 0 (与 phase 224 同源 bug 检测)
 * - AC-5: daemon.log 含 "started" 与 ("Completed" 或 "Error")（防完全空写、grep 弱契约）
 * - AC-6: auditStepCount > 0 时、steps.jsonl 文件存在
 *
 * 不 throw（DP1 + Path #4 防 break finally）。
 * fs read 失败 → emit _skipped + 跳关联 check。
 */

import type { AuditLog } from '../../foundation/audit/index.js';
import type { FileSystem } from '../../foundation/fs/types.js';
import type { DialogStore } from '../../foundation/dialog-store/index.js';
import { formatErr } from '../../foundation/utils/index.js';
import { SUBAGENT_AUDIT_EVENTS } from './audit-events.js';

export interface ArtifactSnapshot {
  readonly agentId: string;
  readonly resultDir: string;
  readonly turnStartCount: number;
  readonly turnEndCount: number;
  readonly textEndCount: number;
  readonly auditStepCount: number;
}

export interface ArtifactDeps {
  readonly fs: FileSystem;
  readonly messageStore: DialogStore;
}

export async function auditSubagentArtifactCompleteness(
  s: ArtifactSnapshot,
  deps: ArtifactDeps,
  audit: AuditLog,
): Promise<void> {
  // AC-1: stream TURN_END = audit TURN_END (counter check 等价、本 phase 内 counter 同步写、应当 =)
  // 注：counter 与 stream 实际写入是 1:1 对应（callback 内 ++）、check 是 boundary 守、防未来 callback 改造引入不对称
  // 本 phase 不额外 emit AC-1（by-construction 保），保留接口供未来升档

  // AC-2: turnStartCount === turnEndCount (pair 对齐)
  if (s.turnStartCount !== s.turnEndCount) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH,
      `kind=ac2_turn_pair_unbalanced`,
      `agentId=${s.agentId}`,
      `turn_start=${s.turnStartCount}`, `turn_end=${s.turnEndCount}`,
    );
  }

  // AC-3: steps.jsonl 行数 vs auditStepCount
  const stepsPath = `${s.resultDir}/steps.jsonl`;
  let stepsLineCount: number | undefined;
  try {
    const exists = await deps.fs.exists(stepsPath);
    if (exists) {
      const content = await deps.fs.read(stepsPath);
      stepsLineCount = content.split('\n').filter(l => l.length > 0).length;
    } else {
      stepsLineCount = 0;
    }
  } catch (err) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_SKIPPED,
      `kind=ac3_skip`, `agentId=${s.agentId}`,
      `reason=steps_read_failed`, `error=${formatErr(err)}`,
    );
  }
  if (stepsLineCount !== undefined && stepsLineCount !== s.auditStepCount) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH,
      `kind=ac3_steps_line_count_mismatch`,
      `agentId=${s.agentId}`,
      `steps_lines=${stepsLineCount}`, `audit_step_count=${s.auditStepCount}`,
    );
  }

  // AC-4: messageStore 末轮 assistant ↔ textEndCount > 0
  try {
    const result = await deps.messageStore.load();
    const messages = result?.session?.messages ?? [];
    const last = messages.at(-1);
    const lastIsAssistant = last?.role === 'assistant';
    const lastHasContent = lastIsAssistant && Array.isArray(last.content)
      ? last.content.some((b: { type?: string }) => b.type === 'text')
      : (lastIsAssistant && typeof last?.content === 'string' && (last.content as string).length > 0);
    if (s.textEndCount > 0 && !lastHasContent) {
      audit.write(
        SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH,
        `kind=ac4_textend_without_last_assistant_text`,
        `agentId=${s.agentId}`,
        `textend_count=${s.textEndCount}`,
        `last_role=${last?.role ?? 'none'}`,
      );
    }
  } catch (err) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_SKIPPED,
      `kind=ac4_skip`, `agentId=${s.agentId}`,
      `reason=message_load_failed`, `error=${formatErr(err)}`,
    );
  }

  // AC-5: daemon.log 含 started + (Completed 或 Error)
  const logPath = `${s.resultDir}/daemon.log`;
  try {
    const exists = await deps.fs.exists(logPath);
    if (!exists) {
      audit.write(
        SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH,
        `kind=ac5_daemon_log_missing`, `agentId=${s.agentId}`,
      );
    } else {
      const content = await deps.fs.read(logPath);
      const hasStarted = content.includes('started');
      const hasEnd = content.includes('Completed') || content.includes('Error');
      if (!hasStarted || !hasEnd) {
        audit.write(
          SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH,
          `kind=ac5_daemon_log_incomplete`, `agentId=${s.agentId}`,
          `has_started=${hasStarted}`, `has_end=${hasEnd}`,
        );
      }
    }
  } catch (err) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_SKIPPED,
      `kind=ac5_skip`, `agentId=${s.agentId}`,
      `reason=daemon_log_read_failed`, `error=${formatErr(err)}`,
    );
  }

  // AC-6: auditStepCount > 0 时 steps.jsonl 必存在
  if (s.auditStepCount > 0 && stepsLineCount === 0) {
    audit.write(
      SUBAGENT_AUDIT_EVENTS.SUBAGENT_ARTIFACT_CROSS_SOURCE_MISMATCH,
      `kind=ac6_steps_missing_with_audit_step`,
      `agentId=${s.agentId}`, `audit_step_count=${s.auditStepCount}`,
    );
  }
}
