/**
 * @module L6.Assembly.ContractNotifyCallback
 * @layer L6 装配层
 * @consumers L6.Assembly.assemble
 *
 * Contract event → outbox notify 回调工厂、按 type 分发 / formatNotifyData 序列化 / outbox.write 发出。
 * 抽出动机：assemble() M#1/SRP 治理（assembly-auditor §六.4 follow-up）。
 */

import type { StreamWriter } from '../foundation/stream/index.js';
import type { AuditLog } from '../foundation/audit/index.js';
import type { ClawId } from '../foundation/identity/index.js';
import type { FileSystem } from '../foundation/fs/types.js';
import { notifyInbox } from '../foundation/messaging/index.js';

export interface ContractNotifyDeps {
  streamWriter: StreamWriter;
  clawId: ClawId;
  systemFs: FileSystem;
  motionInboxDir: string;
  auditWriter: AuditLog;
}

export type ContractNotifyCallback = (type: string, data: Record<string, unknown>) => void;

export function createContractNotifyCallback(deps: ContractNotifyDeps): ContractNotifyCallback {
  return (type: string, data: Record<string, unknown>) => {
    deps.streamWriter.write({ ts: Date.now(), type: 'user_notify', subtype: type, ...data });

    // A.6 双链路：motion inbox 只接契约终态事件（决策点）
    // subtask_completed / verification_failed 仅 streamWriter（viewport 可见、motion 决策无用）
    if (type === 'contract_completed') {
      // phase 1487: A3 path 透传 source_claw 给 motion guidance composer
      // composer 见 source_claw == MOTION_CLAW_ID → null (motion 自家、session 已含上下文)
      // A3 callback 写 motionInboxDir = clawDir/inbox/pending (当前 claw 自家)：
      //   - motion daemon (clawId=motion): 写 motion 自家 inbox (motion sees this case)
      //   - worker daemon (clawId=worker-X): 写 worker 自家 inbox (motion never sees)
      // A3 thin body 无 subtask 信息 → 无 problem_pairs（仅 motion own case 走此 path）
      notifyInbox(deps.systemFs, {
        inboxDir: deps.motionInboxDir,
        type: 'contract_events',
        source: 'system',
        priority: 'high',
        body: `[${type}] claw=${deps.clawId} ${formatNotifyData(data)}`,
        extraFields: {
          source_claw: deps.clawId,
        },
      }, deps.auditWriter);
    }
  };
}

function formatNotifyData(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
}
