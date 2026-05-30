/**
 * status tool — agent-facing self-introspection.
 *
 * 行内职责：聚合 view（调 aggregator）+ 关键 error 写 audit + format 文本。
 * 业务聚合本身归 `aggregators.ts`（CLI `claw <name> status` 共用）。
 */

import type { Tool, ExecContext } from '../../foundation/tools/index.js';
import type { ToolResult } from '../../foundation/tool-protocol/index.js';
import type { ContractSystem } from '../contract/index.js';
import { STATUS_AUDIT_EVENTS } from './audit-events.js';
import {
  computeContractView,
  computeTaskView,
  computeStorageView,
  formatContractView,
  formatTaskView,
  formatStorageView,
} from './aggregators.js';
import { type StatusMotionGuidance, formatMotionGuidance } from './motion-guidance.js';
import { MOTION_CLAW_ID } from '../../constants.js';

export const STATUS_TOOL_NAME = 'status' as const;

/**
 * createStatusTool —— phase 1472 Step D：可选 motionGuidance 参数。
 *
 * 当 ctx.clawId === MOTION_CLAW_ID 且 motionGuidance 被 Assembly 注入时、
 * execute 输出尾段 append CLI hint 段。其他 claw / 未注入时 0 尾段。
 *
 * 装配方（src/assembly/assemble.ts）按 isMotion 判断是否注入 composer 输出。
 */
export function createStatusTool(
  contractSystem: ContractSystem,
  motionGuidance?: StatusMotionGuidance,
): Tool {
  return {
    name: STATUS_TOOL_NAME,
    profiles: ['full', 'readonly'],
    group: 'status',
    description:
      'Get comprehensive status: Claw ID, profile, step count, active contract with full subtask list (id/description/status), tasks, storage (MEMORY.md, clawspace). Call at turn start to re-orient after restart.',
    schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    readonly: true,
    idempotent: true,
    supportsAsync: false,

    async execute(_args: Record<string, unknown>, ctx: ExecContext): Promise<ToolResult> {
      const lines = [
        `Claw ID: ${ctx.clawId}`,
        `Profile: ${ctx.profile}`,
        `Step: ${ctx.stepNumber}/${ctx.maxSteps}`,
        `Elapsed: ${ctx.getElapsedMs()}ms`,
      ];

      const contractView = await computeContractView(contractSystem);
      if (contractView.type === 'error') {
        ctx.auditWriter?.write(STATUS_AUDIT_EVENTS.CONTRACT_ERROR, `error=${contractView.message}`);
      }
      lines.push(formatContractView(contractView));

      const taskView = await computeTaskView(ctx.fs);
      if (taskView.type === 'counts') {
        if (taskView.pendingError) {
          ctx.auditWriter?.write(STATUS_AUDIT_EVENTS.TASK_PENDING_ERROR, `error=${taskView.pendingError}`);
        }
        if (taskView.runningError) {
          ctx.auditWriter?.write(STATUS_AUDIT_EVENTS.TASK_RUNNING_ERROR, `error=${taskView.runningError}`);
        }
      }
      lines.push(formatTaskView(taskView));

      const storageView = await computeStorageView(ctx.fs);
      lines.push(...formatStorageView(storageView));

      // phase 1472 Step D — motion guidance 尾段（仅 motion + 已注入时）
      if (motionGuidance && ctx.clawId === MOTION_CLAW_ID) {
        lines.push(formatMotionGuidance(motionGuidance));
      }

      return {
        success: true,
        content: lines.join('\n'),
      };
    },
  };
}
