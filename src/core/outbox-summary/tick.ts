/**
 * @module L4.OutboxSummary
 * phase 1476: one orchestration tick = scan + dedup + write.
 *
 * 流程：
 * 1. scan claws/*\/outbox/pending → state
 * 2. if total_msgs == 0: 删 motion/inbox/pending 现有 summary + emit CLEARED + return
 * 3. dedup query: hash 已在 motion inbox pending/done (mtime<24h) → SKIPPED + return
 * 4. 不同 hash → 删旧 pending summary + 写新 + emit WRITTEN
 *
 * 异常隔离归 cron runner（throw → cron_job_error / 详 l5_cron.md §1）.
 */

import * as path from 'path';
import type { FileSystem } from '../../foundation/fs/types.js';
import type { AuditLog } from '../../foundation/audit/index.js';
import type { ClawforumRoot } from '../../foundation/identity/index.js';
import { MOTION_CLAW_ID } from '../../constants.js';
import { CRON_AUDIT_EVENTS } from '../cron/audit-events.js';
import { scanOutboxes } from './scan.js';
import { findExistingSummaryByHash } from './dedup.js';
import { clearPendingSummaries, writeNewSummary } from './write.js';

export interface OutboxSummaryTickDeps {
  clawforumRoot: ClawforumRoot;
  fs: FileSystem;
  audit: AuditLog;
  now?: () => number;
}

export async function runOutboxSummaryTick(deps: OutboxSummaryTickDeps): Promise<void> {
  const motionInboxDir = path.join(deps.clawforumRoot, MOTION_CLAW_ID, 'inbox');
  const state = scanOutboxes({ clawforumRoot: deps.clawforumRoot, fs: deps.fs });

  // (2) 0 unread → 清干净 + return
  if (state.total_msgs === 0) {
    const removed = clearPendingSummaries({
      motionInboxDir, fs: deps.fs, audit: deps.audit, now: deps.now,
    });
    if (removed > 0) {
      deps.audit.write(CRON_AUDIT_EVENTS.OUTBOX_SUMMARY_CLEARED, `removed=${removed}`);
    }
    return;
  }

  // (3) dedup hit → skip
  const hit = findExistingSummaryByHash({ motionInboxDir, fs: deps.fs, now: deps.now }, state.hash);
  if (hit !== null) {
    deps.audit.write(
      CRON_AUDIT_EVENTS.OUTBOX_SUMMARY_SKIPPED,
      `hash=${state.hash}`,
      `reason=${hit}`,
    );
    return;
  }

  // (4) 不同 hash → 清旧 + 写新
  clearPendingSummaries({
    motionInboxDir, fs: deps.fs, audit: deps.audit, now: deps.now,
  });
  await writeNewSummary(
    { motionInboxDir, fs: deps.fs, audit: deps.audit, now: deps.now },
    state,
  );
}
