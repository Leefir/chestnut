/**
 * @module L4.OutboxSummary
 * phase 1476: write new summary to motion/inbox/pending + clear old versions.
 *
 * Filename 编入 hash 让 dedup grep 无需 decode 文件内容（性能 / 简洁）.
 * 内容仍走 encodeInbox codec（wire format unified phase 1323）.
 */

import * as path from 'path';
import { randomUUID } from 'crypto';
import type { FileSystem } from '../../foundation/fs/types.js';
import type { AuditLog } from '../../foundation/audit/index.js';
import { encodeInbox } from '../../foundation/messaging/codec-inbox.js';
import type { InboxMessage } from '../../foundation/messaging/types.js';
import { CRON_AUDIT_EVENTS } from '../cron/audit-events.js';
import { MOTION_CLAW_ID } from '../../constants.js';
import { listPendingSummaries } from './dedup.js';
import { toExtraMeta } from './types.js';
import type { OutboxSummaryState } from './types.js';

export const SUMMARY_FILENAME_PREFIX = 'claw_outbox_summary';
export const SUMMARY_INBOX_TYPE = 'claw_outbox_summary';

export interface WriteDeps {
  motionInboxDir: string;     // <root>/motion/inbox
  fs: FileSystem;
  audit: AuditLog;
  now?: () => number;
}

/** Delete all existing summary files in motion/inbox/pending. Returns count removed. */
export function clearPendingSummaries(deps: WriteDeps): number {
  const files = listPendingSummaries({ motionInboxDir: deps.motionInboxDir, fs: deps.fs });
  let removed = 0;
  for (const f of files) {
    try {
      deps.fs.deleteSync(path.join(deps.motionInboxDir, 'pending', f));
      removed++;
    } catch {
      // silent: race / concurrent CLI consumption
    }
  }
  return removed;
}

/**
 * Write new summary file. Filename = `<ts>_claw_outbox_summary_<hash12>_<uuid8>.md`.
 * Content uses encodeInbox + extraMeta (hash + counts + totals) for Assembly composer consumption.
 */
export async function writeNewSummary(deps: WriteDeps, state: OutboxSummaryState): Promise<string> {
  const now = deps.now?.() ?? Date.now();
  const ts = String(now).padStart(15, '0');
  const uuid8 = randomUUID().slice(0, 8);
  const filename = `${ts}_${SUMMARY_FILENAME_PREFIX}_${state.hash}_${uuid8}.md`;

  const body = formatBody(state);
  const msg: InboxMessage = {
    id: `${SUMMARY_FILENAME_PREFIX}-${state.hash}-${now}`,
    type: SUMMARY_INBOX_TYPE,
    from: 'system',
    to: MOTION_CLAW_ID,
    content: body,
    priority: 'normal',
    timestamp: new Date(now).toISOString(),
    extraMeta: toExtraMeta(state),
  };

  const content = encodeInbox(msg, toExtraMeta(state));
  const pendingDir = path.join(deps.motionInboxDir, 'pending');
  await deps.fs.ensureDir(pendingDir);
  const filepath = path.join(pendingDir, filename);
  await deps.fs.writeAtomic(filepath, content);

  deps.audit.write(
    CRON_AUDIT_EVENTS.OUTBOX_SUMMARY_WRITTEN,
    `hash=${state.hash}`,
    `total_claws=${state.total_claws}`,
    `total_msgs=${state.total_msgs}`,
  );

  return filename;
}

/** Format body: human-readable counts breakdown. Guidance 由 Assembly composer 追加. */
function formatBody(state: OutboxSummaryState): string {
  const summary = Object.entries(state.counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `${id}(${n})`)
    .join(', ');
  return `[system] outbox 未读：${summary}。共 ${state.total_claws} 个 claw ${state.total_msgs} 条消息。`;
}
