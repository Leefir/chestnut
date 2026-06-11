/**
 * messaging inbox/outbox write 后 dedup 一致性 cross-source audit。
 *
 * 应然 anchor（per design/modules/l2_messaging.md §「persist-state observability」、phase 273 Step B）：
 * - DP1 信息不丢失：filename collision / race write = 一方信息丢
 * - DP3 状态可观察：collision 显式 audit
 * - DP5 凭日志记录重建：dedup 契约抬到运行期
 * - M#3 资源唯一：scope 限 messaging 自治、不跨模块业务一致性
 *
 * CC-1: InboxWriter 写入后、inbox dir 内 prefix {source}- + 同 ms timestamp 文件数 = 1
 * CC-2: OutboxWriter 写入后、outbox dir 内 prefix {ms timestamp}_{type}_ 文件数 = 1
 *
 * 不 throw（DP1 + Path #4 防 break write 路径）。
 * fs.list 失败 → emit _skipped。
 */

import type { AuditLog } from '../audit/index.js';
import type { FileSystem } from '../fs/types.js';
import { formatErr } from '../utils/index.js';
import { MESSAGING_AUDIT_EVENTS } from './audit-events.js';

/**
 * CC-1: inbox dir 内 prefix 同 source 同 ms timestamp 唯一
 * filename 格式: {source}-{15-digit-timestamp}_{priority}_{uuid8}.md
 * 取 prefix `{source}-{15-digit-timestamp}_` 检 dir 内文件数
 */
export async function auditInboxDedup(
  filename: string,
  inboxDir: string,
  fs: FileSystem,
  audit: AuditLog,
): Promise<void> {
  const m = filename.match(/^(.+?)-(\d{15})_/);
  if (!m) {
    // filename 未按格式构造、不 emit、留 future invariant 守 filename 格式
    return;
  }
  const prefix = `${m[1]}-${m[2]}_`;

  let entries: Array<{ name: string }>;
  try {
    entries = await fs.list(inboxDir, { includeDirs: false });
  } catch (err) {
    audit.write(
      MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_SKIPPED,
      `kind=cc1_skip`, `reason=fs_list_failed`,
      `error=${formatErr(err)}`,
    );
    return;
  }

  const matches = entries.filter(e => e.name.startsWith(prefix));
  if (matches.length > 1) {
    audit.write(
      MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH,
      `kind=cc1_inbox_prefix_collision`,
      `filename=${filename}`, `prefix=${prefix}`,
      `collision_count=${matches.length}`,
      `collision_files=${matches.slice(0, 5).map(e => e.name).join(',')}`,
    );
  }
}

/**
 * CC-2: outbox dir 内 prefix {ms timestamp}_{type}_ 唯一
 * filename 格式: {ms-timestamp}_{typeSlug}_{uuid8}.md
 */
export async function auditOutboxDedup(
  filename: string,
  outboxDir: string,
  fs: FileSystem,
  audit: AuditLog,
): Promise<void> {
  const m = filename.match(/^(\d+)_(.+?)_/);
  if (!m) return;
  const prefix = `${m[1]}_${m[2]}_`;

  let entries: Array<{ name: string }>;
  try {
    entries = await fs.list(outboxDir, { includeDirs: false });
  } catch (err) {
    audit.write(
      MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_SKIPPED,
      `kind=cc2_skip`, `reason=fs_list_failed`,
      `error=${formatErr(err)}`,
    );
    return;
  }

  const matches = entries.filter(e => e.name.startsWith(prefix));
  if (matches.length > 1) {
    audit.write(
      MESSAGING_AUDIT_EVENTS.MESSAGING_DEDUP_CROSS_SOURCE_MISMATCH,
      `kind=cc2_outbox_prefix_collision`,
      `filename=${filename}`, `prefix=${prefix}`,
      `collision_count=${matches.length}`,
      `collision_files=${matches.slice(0, 5).map(e => e.name).join(',')}`,
    );
  }
}
