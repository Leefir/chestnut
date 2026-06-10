import type { ContractYaml } from '../contract/index.js';
import type { ContractCreatePolicy, CreatePolicyContext } from '../contract/types.js';
import { ContractCreatePolicyViolationError } from '../contract/types.js';
import { CliError } from '../../cli/errors.js';
import { SUMMON_AUDIT_EVENTS } from './audit-events.js';
import type { SummonStateStore } from './summon-state-store.js';
import type { AuditLog } from '../../foundation/audit/index.js';
import type { TaskId } from '../async-task-system/types.js';

// ============================================================================
// Phase 230: SummonVerifyPolicy — ContractCreatePolicy implementation
// ============================================================================

export interface SummonVerifyPolicyDeps {
  summonStateStore: SummonStateStore;
  auditWriter: AuditLog;
}

export function createSummonVerifyPolicy(
  deps: SummonVerifyPolicyDeps,
): ContractCreatePolicy {
  return {
    name: 'summon-verify',
    async check(ctx: CreatePolicyContext, contract: ContractYaml): Promise<void> {
      const subagentTaskId = ctx.subagentTaskId;
      if (!subagentTaskId) {
        // 非 subagent 路径（如 motion 直接 contract create）、本 policy 不适用、pass-through
        return;
      }

      let decision;
      try {
        decision = await deps.summonStateStore.read(subagentTaskId as TaskId);
      } catch (err) {
        deps.auditWriter.write(
          SUMMON_AUDIT_EVENTS.SUMMON_STATE_READ_FAILED,
          `taskId=${subagentTaskId}`,
          `error=${String(err)}`,
        );
        // 读失败 = 未知状态、pass-through 不误拦（M#1 业务承诺无法判定时不强阻）
        return;
      }

      if (!decision) {
        // store 找不到 decision = 非 summon 创建路径（如直接 CLI 调用、其他 caller subagent）
        deps.auditWriter.write(
          SUMMON_AUDIT_EVENTS.SUMMON_GATE_NO_DECISION,
          `subagentTaskId=${subagentTaskId}`,
          'reason=likely_non_summon_subagent',
        );
        return;
      }

      if (decision.verify) {
        return; // verify=true → 无限制
      }

      // verify=false 路径：检查 verification 承诺
      const verificationArr = contract.verification ?? [];
      if (verificationArr.length > 0) {
        deps.auditWriter.write(
          SUMMON_AUDIT_EVENTS.SUMMON_VERIFY_FALSE_VIOLATION,
          `subagentTaskId=${subagentTaskId}`,
          `targetClaw=${decision.targetClaw ?? '(unset)'}`,
          `verificationCount=${verificationArr.length}`,
        );
        throw new ContractCreatePolicyViolationError(
          'summon-verify',
          'summon_verify_false_violation',
          {
            subagentTaskId,
            targetClaw: decision.targetClaw,
            verificationCount: verificationArr.length,
            note: 'summon dispatch with verify=false; contract must not include verification entries',
          },
        );
      }

      // phase 119: target_claw 边界校验（verify=false 路径）
      const clawDir = ctx.clawDir;
      if (decision.targetClaw && clawDir && decision.targetClaw !== clawDir) {
        deps.auditWriter.write(
          SUMMON_AUDIT_EVENTS.SUMMON_TARGET_CLAW_VIOLATION,
          `subagentTaskId=${subagentTaskId}`,
          `expectedTargetClaw=${decision.targetClaw}`,
          `requestedClawId=${clawDir}`,
        );
        throw new ContractCreatePolicyViolationError(
          'summon-verify',
          'summon_target_claw_violation',
          {
            subagentTaskId,
            expectedTargetClaw: decision.targetClaw,
            requestedClawId: clawDir,
            note: 'cross-claw contract creation from a summon subagent is prohibited',
          },
        );
      }
    },
  };
}

// ============================================================================
// Phase 230 adapter shim (deprecated — Step D will delete)
// ============================================================================

export interface SummonContractCreateGate {
  /**
   * Gate check before CLI accepts contract create.
   *
   * Behavior matrix:
   * - subagentTaskId 未设 → no-op pass（非子代理路径，如用户手动 CLI）
   * - subagentTaskId 已设 + store 找不到 decision → audit warn + pass（非 summon 子代理路径，如 spawn）
   * - subagentTaskId 已设 + decision.verify=true → pass
   * - subagentTaskId 已设 + decision.verify=false + contract.verification 空/缺 → pass
   * - subagentTaskId 已设 + decision.verify=false + contract.verification 非空 → throw CliError + audit
   * - subagentTaskId 已设 + decision.verify=false + decision.targetClaw 已设 + requestedClawId !== decision.targetClaw → throw CliError + audit
   */
  check(subagentTaskId: string | undefined, contract: ContractYaml, requestedClawId: string): Promise<void>;
}

/** @deprecated phase 230 起改用 createSummonVerifyPolicy + ContractSystem.registerCreatePolicy；Step D 删此工厂 */
export function createSummonContractCreateGate(
  store: SummonStateStore,
  audit?: AuditLog,
): SummonContractCreateGate {
  const noopAudit: AuditLog = {
    __brand: 'AuditLog',
    write() {},
    preview(s: string) { return s; },
    message(s: string) { return s; },
    summary(s: string) { return s; },
  };
  const policy = createSummonVerifyPolicy({ summonStateStore: store, auditWriter: audit ?? noopAudit });
  return {
    async check(subagentTaskId, contract, requestedClawId) {
      // delegate to policy.check、但 throw CliError 维持向后兼容
      try {
        await policy.check({ subagentTaskId, clawDir: requestedClawId }, contract);
      } catch (err) {
        if (err instanceof ContractCreatePolicyViolationError) {
          if (err.cause === 'summon_target_claw_violation') {
            throw new CliError(
              `SUMMON_TARGET_CLAW_VIOLATION: this contract was generated by a summon subagent ` +
              `dispatched with targetClaw=${(err.details?.expectedTargetClaw as string) ?? '?'}, ` +
              `but you are creating a contract for claw=${(err.details?.requestedClawId as string) ?? '?'}. ` +
              `Cross-claw contract creation from a summon subagent is prohibited. ` +
              `Re-run with --claw ${(err.details?.expectedTargetClaw as string) ?? '?'}.`,
              err.details,
            );
          }
          throw new CliError(
            `SUMMON_VERIFY_FALSE_VIOLATION: this contract was generated by a summon subagent ` +
            `dispatched with verify=false (default), but contract.yaml contains a non-empty ` +
            `verification array (${(err.details?.verificationCount as number) ?? '?'} entries). Either:\n` +
            `  - Remove the verification array from contract.yaml (recommended; matches summon default), or\n` +
            `  - Caller re-dispatches summon with explicit verify=true if verification is actually required.`,
            err.details,
          );
        }
        throw err;
      }
    },
  };
}
